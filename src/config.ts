import * as vscode from 'vscode';
import * as path from 'path';

export type Severity = 'error' | 'warning' | 'info' | 'hint';
export type ApplyTo = 'savedFile' | 'matchedFile' | 'allFiles';

export interface WatcherConfig {
    name: string;
    filePattern: string | string[];
    command: string;
    outputPattern: string;
    /** Regex matching continuation lines — their `message` group (or full line) is appended to the previous diagnostic. */
    continuationPattern: string | undefined;
    severity: Severity;
    enabled: boolean;
    runInShell: boolean;
    cwd: string;
    env: Record<string, string>;
    encoding: BufferEncoding;
    parseStderr: boolean;
    applyTo: ApplyTo;
    /** Exit codes that are expected (e.g. 1 for linters that exit non-zero on warnings). Non-zero codes not in this list are logged as unexpected. */
    ignoreExitCodes: number[];
    /** URL template for the error code documentation. Use \`${code}\` as placeholder. Sets a clickable link in the Problems panel. */
    codeUrl: string | undefined;
}

export interface ExtensionConfig {
    watchers: WatcherConfig[];
    enabled: boolean;
    runOnOpen: boolean;
    clearDiagnosticsOnSave: boolean;
    showOutputOnError: boolean;
    debounceMs: number;
}

export function getExtensionConfig(resource?: vscode.Uri): ExtensionConfig {
    const raw = vscode.workspace.getConfiguration('universalFileWatcher', resource ?? null);

    const rawWatchers = raw.get<Partial<WatcherConfig>[]>('watchers', []);
    const watchers: WatcherConfig[] = rawWatchers.map(w => ({
        name: w.name ?? 'Unnamed',
        filePattern: w.filePattern ?? '**/*',
        command: w.command ?? '',
        outputPattern: w.outputPattern ?? '',
        continuationPattern: w.continuationPattern ?? undefined,
        severity: w.severity ?? 'error',
        enabled: w.enabled !== false,
        runInShell: w.runInShell !== false,
        cwd: w.cwd ?? '${workspaceFolder}',
        env: w.env ?? {},
        encoding: (w.encoding ?? 'utf8') as BufferEncoding,
        parseStderr: w.parseStderr === true,
        applyTo: w.applyTo ?? 'matchedFile',
        ignoreExitCodes: w.ignoreExitCodes ?? [],
        codeUrl: w.codeUrl ?? undefined,
    }));

    return {
        watchers,
        enabled: raw.get<boolean>('enabled', true),
        runOnOpen: raw.get<boolean>('runOnOpen', false),
        clearDiagnosticsOnSave: raw.get<boolean>('clearDiagnosticsOnSave', true),
        showOutputOnError: raw.get<boolean>('showOutputOnError', false),
        debounceMs: raw.get<number>('debounceMs', 300),
    };
}

/**
 * Expand variables like ${file}, ${workspaceFolder}, etc. in a string.
 */
export function expandVariables(
    template: string,
    fileUri: vscode.Uri,
    workspaceFolder: vscode.WorkspaceFolder | undefined,
): string {
    const filePath = fileUri.fsPath;
    const wsFolderPath = workspaceFolder?.uri.fsPath ?? path.dirname(filePath);

    return template
        .replace(/\$\{file\}/g, filePath)
        .replace(/\$\{fileBasename\}/g, path.basename(filePath))
        .replace(/\$\{fileBasenameNoExtension\}/g, path.basename(filePath, path.extname(filePath)))
        .replace(/\$\{fileDirname\}/g, path.dirname(filePath))
        .replace(/\$\{fileExtname\}/g, path.extname(filePath))
        .replace(/\$\{fileRelative\}/g, path.relative(wsFolderPath, filePath))
        .replace(/\$\{workspaceFolder\}/g, wsFolderPath);
}

export function toVscodeSeverity(s: Severity | string): vscode.DiagnosticSeverity {
    switch (s.toLowerCase()) {
        case 'error': return vscode.DiagnosticSeverity.Error;
        case 'warning':
        case 'warn': return vscode.DiagnosticSeverity.Warning;
        case 'info':
        case 'note':
        case 'information': return vscode.DiagnosticSeverity.Information;
        case 'hint': return vscode.DiagnosticSeverity.Hint;
        default: return vscode.DiagnosticSeverity.Error;
    }
}
