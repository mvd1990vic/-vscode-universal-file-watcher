import * as vscode from 'vscode';
import * as path from 'path';
import { WatcherConfig, toVscodeSeverity } from './config.js';

export interface ParsedDiagnostic {
    /** Absolute path or undefined (means: attach to the saved file). */
    file: string | undefined;
    diagnostic: vscode.Diagnostic;
    /** True when col was captured but endCol was not — caller should expand range to word boundaries. */
    needsWordExpansion: boolean;
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
    const hasLine = !!groups['line'];
    const hasCol = !!(groups['col'] ?? groups['column']);
    const hasEndCol = !!groups['endCol'];

    const lineNum = hasLine ? Math.max(0, parseInt(groups['line']!, 10) - 1) : 0;
    const colNum = hasCol ? Math.max(0, parseInt((groups['col'] ?? groups['column'])!, 10) - 1) : 0;
    const endLineNum = groups['endLine'] ? Math.max(0, parseInt(groups['endLine'], 10) - 1) : lineNum;
    // No col at all → whole line; col but no endCol → placeholder (will expand to word); endCol → exact
    const endColNum = hasEndCol
        ? Math.max(0, parseInt(groups['endCol']!, 10) - 1)
        : hasCol
            ? colNum + 1
            : Number.MAX_SAFE_INTEGER;

    const needsWordExpansion = hasCol && !hasEndCol;

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
        if (watcher.codeUrl) {
            const url = watcher.codeUrl.replace(/\$\{code\}/g, encodeURIComponent(code));
            try {
                diagnostic.code = { value: code, target: vscode.Uri.parse(url, true) };
            } catch {
                diagnostic.code = code;
            }
        } else {
            diagnostic.code = code;
        }
    }

    // --- file ---
    let file: string | undefined;
    const rawFile = groups['file'];
    if (rawFile) {
        file = path.isAbsolute(rawFile)
            ? rawFile
            : path.resolve(workspaceFolderPath ?? path.dirname(savedFilePath), rawFile);
    }

    return { file, diagnostic, needsWordExpansion };
}

/**
 * Parse all lines of tool output. Returns a map from absolute file path → diagnostics.
 * When applyTo is 'savedFile', all diagnostics go to savedFilePath regardless of the
 * captured file group.
 */
export interface ParseOutput {
    diagMap: Map<string, vscode.Diagnostic[]>;
    /** Diagnostics whose range should be expanded to word boundaries (col was given but endCol was not). */
    wordExpansionSet: Set<vscode.Diagnostic>;
}

export function parseOutput(
    stdout: string,
    stderr: string,
    watcher: WatcherConfig,
    savedFilePath: string,
    workspaceFolderPath: string | undefined,
): ParseOutput {
    const diagMap = new Map<string, vscode.Diagnostic[]>();
    const wordExpansionSet = new Set<vscode.Diagnostic>();

    const addDiag = (filePath: string, diag: vscode.Diagnostic) => {
        const list = diagMap.get(filePath) ?? [];
        list.push(diag);
        diagMap.set(filePath, list);
    };

    const outputLines = stdout.split(/\r?\n/);
    if (watcher.parseStderr) {
        outputLines.push(...stderr.split(/\r?\n/));
    }

    let contRegex: RegExp | undefined;
    if (watcher.continuationPattern) {
        try { contRegex = new RegExp(watcher.continuationPattern); } catch { /* invalid regex — ignore */ }
    }

    let lastDiagnostic: vscode.Diagnostic | undefined;

    for (const line of outputLines) {
        if (!line.trim()) {
            lastDiagnostic = undefined;
            continue;
        }

        const parsed = parseLine(line, watcher, savedFilePath, workspaceFolderPath);

        if (!parsed) {
            // Try continuation pattern before skipping the line
            if (contRegex && lastDiagnostic) {
                const m = contRegex.exec(line);
                if (m) {
                    const extra = (m.groups?.['message'] ?? line).trim();
                    lastDiagnostic.message += '\n' + extra;
                }
            }
            continue;
        }

        const { file: capturedFile, diagnostic, needsWordExpansion } = parsed;
        lastDiagnostic = diagnostic;

        if (needsWordExpansion) {
            wordExpansionSet.add(diagnostic);
        }

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

    return { diagMap, wordExpansionSet };
}
