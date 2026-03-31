import * as vscode from 'vscode';
import * as path from 'path';
import { WatcherConfig, toVscodeSeverity } from './config.js';

export interface ParsedDiagnostic {
    /** Absolute path or undefined (means: attach to the saved file). */
    file: string | undefined;
    diagnostic: vscode.Diagnostic;
}

/**
 * Parse one line of tool output using the watcher's outputPattern regex.
 * Returns null if the line does not match.
 */
export function parseLine(
    line: string,
    watcher: WatcherConfig,
    savedFilePath: string,
    workspaceFolderPath: string | undefined,
): ParsedDiagnostic | null {
    let regex: RegExp;
    try {
        regex = new RegExp(watcher.outputPattern);
    } catch {
        return null;
    }

    const match = regex.exec(line);
    if (!match?.groups) {
        return null;
    }

    const groups = match.groups;

    // --- location ---
    const lineNum = Math.max(0, parseInt(groups['line'] ?? '1', 10) - 1);
    const colNum = Math.max(0, parseInt(groups['col'] ?? groups['column'] ?? '1', 10) - 1);
    const endLineNum = groups['endLine'] ? Math.max(0, parseInt(groups['endLine'], 10) - 1) : lineNum;
    const endColNum = groups['endCol'] ? Math.max(0, parseInt(groups['endCol'], 10) - 1) : colNum + 1;

    const range = new vscode.Range(lineNum, colNum, endLineNum, endColNum);

    // --- severity ---
    const rawSeverity = groups['severity'] ?? watcher.severity;
    const severity = toVscodeSeverity(rawSeverity);

    // --- message ---
    const message = (groups['message'] ?? line).trim();

    // --- code ---
    const code = groups['code'];

    const diagnostic = new vscode.Diagnostic(range, message, severity);
    diagnostic.source = watcher.name;
    if (code) {
        diagnostic.code = code;
    }

    // --- file ---
    let file: string | undefined;
    const rawFile = groups['file'];
    if (rawFile) {
        file = path.isAbsolute(rawFile)
            ? rawFile
            : path.resolve(workspaceFolderPath ?? path.dirname(savedFilePath), rawFile);
    }

    return { file, diagnostic };
}

/**
 * Parse all lines of tool output. Returns a map from absolute file path → diagnostics.
 * When applyTo is 'savedFile', all diagnostics go to savedFilePath regardless of the
 * captured file group.
 */
export function parseOutput(
    stdout: string,
    stderr: string,
    watcher: WatcherConfig,
    savedFilePath: string,
    workspaceFolderPath: string | undefined,
): Map<string, vscode.Diagnostic[]> {
    const result = new Map<string, vscode.Diagnostic[]>();

    const addDiag = (filePath: string, diag: vscode.Diagnostic) => {
        const list = result.get(filePath) ?? [];
        list.push(diag);
        result.set(filePath, list);
    };

    const outputLines = stdout.split(/\r?\n/);
    if (watcher.parseStderr) {
        outputLines.push(...stderr.split(/\r?\n/));
    }

    for (const line of outputLines) {
        if (!line.trim()) {
            continue;
        }

        const parsed = parseLine(line, watcher, savedFilePath, workspaceFolderPath);
        if (!parsed) {
            continue;
        }

        const { file: capturedFile, diagnostic } = parsed;

        if (watcher.applyTo === 'savedFile') {
            addDiag(savedFilePath, diagnostic);
        } else if (watcher.applyTo === 'matchedFile') {
            addDiag(capturedFile ?? savedFilePath, diagnostic);
        } else {
            // allFiles: attach to captured file if available AND to saved file
            addDiag(capturedFile ?? savedFilePath, diagnostic);
            if (capturedFile && capturedFile !== savedFilePath) {
                addDiag(savedFilePath, diagnostic);
            }
        }
    }

    return result;
}
