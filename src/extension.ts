import * as vscode from 'vscode';
import * as path from 'path';
import { minimatch } from 'minimatch';
import { getExtensionConfig, WatcherConfig } from './config.js';
import { runWatcher } from './runner.js';
import { parseOutput } from './parser.js';
import { DiagnosticsManager } from './diagnostics.js';
import { StatusBarManager } from './statusBar.js';

// Per-file map of AbortControllers so we can cancel in-flight runs on a new save.
const abortControllers = new Map<string, AbortController>();
// Debounce timers per file.
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

let outputChannel: vscode.OutputChannel;
let diagnosticsManager: DiagnosticsManager;
let statusBar: StatusBarManager;

export function activate(context: vscode.ExtensionContext): void {
    try {
        activateInner(context);
    } catch (err) {
        vscode.window.showErrorMessage(`Universal File Watcher failed to activate: ${err}`);
        throw err;
    }
}

function activateInner(context: vscode.ExtensionContext): void {
    outputChannel = vscode.window.createOutputChannel('Universal File Watcher');
    diagnosticsManager = new DiagnosticsManager();
    statusBar = new StatusBarManager();

    outputChannel.appendLine('Universal File Watcher activated.');

    // --- Commands ---

    context.subscriptions.push(
        vscode.commands.registerCommand('universalFileWatcher.runOnCurrent', () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('Universal File Watcher: No active editor.');
                return;
            }
            scheduleRun(editor.document.uri, /* force */ true);
        }),

        vscode.commands.registerCommand('universalFileWatcher.clearDiagnostics', () => {
            diagnosticsManager.clearAll();
            vscode.window.showInformationMessage('Universal File Watcher: All diagnostics cleared.');
        }),

        vscode.commands.registerCommand('universalFileWatcher.showOutput', () => {
            outputChannel.show();
        }),

        vscode.commands.registerCommand('universalFileWatcher.enable', () => {
            vscode.workspace.getConfiguration('universalFileWatcher').update(
                'enabled', true, vscode.ConfigurationTarget.Workspace
            );
            statusBar.setEnabled(true);
            vscode.window.showInformationMessage('Universal File Watcher: Enabled.');
        }),

        vscode.commands.registerCommand('universalFileWatcher.disable', () => {
            vscode.workspace.getConfiguration('universalFileWatcher').update(
                'enabled', false, vscode.ConfigurationTarget.Workspace
            );
            statusBar.setEnabled(false);
            vscode.window.showInformationMessage('Universal File Watcher: Disabled.');
        }),
    );

    // --- Triggers ---

    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument(doc => {
            scheduleRun(doc.uri);
        }),
    );

    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(doc => {
            const cfg = getExtensionConfig(doc.uri);
            if (cfg.runOnOpen) {
                scheduleRun(doc.uri);
            }
        }),
    );

    // Re-run on config change so feedback is immediate.
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('universalFileWatcher')) {
                const cfg = getExtensionConfig();
                statusBar.setEnabled(cfg.enabled);
                outputChannel.appendLine('Configuration reloaded.');
            }
        }),
    );

    context.subscriptions.push(outputChannel, diagnosticsManager, statusBar);
}

export function deactivate(): void {
    for (const ac of abortControllers.values()) {
        ac.abort();
    }
    abortControllers.clear();
    for (const t of debounceTimers.values()) {
        clearTimeout(t);
    }
    debounceTimers.clear();
}

// ---------------------------------------------------------------------------

function scheduleRun(fileUri: vscode.Uri, force = false): void {
    const cfg = getExtensionConfig(fileUri);
    if (!cfg.enabled && !force) {
        return;
    }

    const filePath = fileUri.fsPath;

    // Cancel existing debounce timer.
    const existingTimer = debounceTimers.get(filePath);
    if (existingTimer) {
        clearTimeout(existingTimer);
    }

    const delay = force ? 0 : cfg.debounceMs;
    const timer = setTimeout(() => {
        debounceTimers.delete(filePath);
        runAllMatchingWatchers(fileUri, cfg.watchers);
    }, delay);

    debounceTimers.set(filePath, timer);
}

async function runAllMatchingWatchers(
    fileUri: vscode.Uri,
    watchers: WatcherConfig[],
): Promise<void> {
    const filePath = fileUri.fsPath;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(fileUri);

    const cfg = getExtensionConfig(fileUri);

    // Cancel any previous run for this file.
    abortControllers.get(filePath)?.abort();
    const ac = new AbortController();
    abortControllers.set(filePath, ac);

    // Clear diagnostics before running if configured.
    if (cfg.clearDiagnosticsOnSave) {
        diagnosticsManager.clearForFile(filePath);
    }

    const matchingWatchers = watchers.filter(
        w => w.enabled && matchesPattern(filePath, w.filePattern),
    );

    if (matchingWatchers.length === 0) {
        return;
    }

    let totalErrors = 0;

    // Run all matching watchers (in parallel).
    await Promise.all(matchingWatchers.map(async watcher => {
        if (ac.signal.aborted) {
            return;
        }

        statusBar.startRun(watcher.name);

        try {
            const result = await runWatcher(watcher, fileUri, workspaceFolder, ac.signal, outputChannel);

            if (result.cancelled) {
                return;
            }

            if (result.exitCode !== 0 && !watcher.ignoreExitCodes.includes(result.exitCode)) {
                outputChannel.appendLine(`  ⚠ [${watcher.name}] Unexpected exit code ${result.exitCode} — add to ignoreExitCodes if expected`);
            }

            const { diagMap, wordExpansionSet } = parseOutput(
                result.stdout,
                result.stderr,
                watcher,
                filePath,
                workspaceFolder?.uri.fsPath,
            );

            let watcherErrors = 0;
            for (const [diagFilePath, diagnostics] of diagMap) {
                const expanded = await expandWordRanges(diagFilePath, diagnostics, wordExpansionSet);
                diagnosticsManager.set(diagFilePath, watcher.name, expanded);
                watcherErrors += expanded.filter(
                    d => d.severity === 0 /* Error */
                ).length;
            }

            totalErrors += watcherErrors;

            if (watcherErrors > 0 && cfg.showOutputOnError) {
                outputChannel.show(true);
            }
        } finally {
            statusBar.endRun(totalErrors);
        }
    }));

    // Clean up the AbortController if it's still ours.
    if (abortControllers.get(filePath) === ac) {
        abortControllers.delete(filePath);
    }
}

function matchesPattern(filePath: string, pattern: string | string[]): boolean {
    const patterns = Array.isArray(pattern) ? pattern : [pattern];
    const normalized = filePath.replace(/\\/g, '/');
    return patterns.some(p => minimatch(normalized, p, { dot: true, matchBase: true }));
}

async function expandWordRanges(
    filePath: string,
    diagnostics: vscode.Diagnostic[],
    wordExpansionSet: Set<vscode.Diagnostic>,
): Promise<vscode.Diagnostic[]> {
    const toExpand = diagnostics.filter(d => wordExpansionSet.has(d));
    if (toExpand.length === 0) {
        return diagnostics;
    }

    let doc: vscode.TextDocument | undefined;
    try {
        doc = await vscode.workspace.openTextDocument(filePath);
    } catch {
        return diagnostics;
    }

    return diagnostics.map(diag => {
        if (!wordExpansionSet.has(diag)) {
            return diag;
        }

        const lineNum = diag.range.start.line;
        const col = diag.range.start.character;

        if (lineNum >= doc!.lineCount) {
            return diag;
        }

        const lineText = doc!.lineAt(lineNum).text;

        let wordStart = col;
        while (wordStart > 0 && /\w/.test(lineText[wordStart - 1])) {
            wordStart--;
        }

        let wordEnd = col;
        while (wordEnd < lineText.length && /\w/.test(lineText[wordEnd])) {
            wordEnd++;
        }

        // If col is not on a word character, keep single-char highlight
        if (wordEnd === wordStart) {
            wordEnd = col + 1;
        }

        const newDiag = new vscode.Diagnostic(
            new vscode.Range(lineNum, wordStart, lineNum, wordEnd),
            diag.message,
            diag.severity,
        );
        newDiag.source = diag.source;
        newDiag.code = diag.code;
        newDiag.tags = diag.tags;
        newDiag.relatedInformation = diag.relatedInformation;
        return newDiag;
    });
}
