import * as vscode from 'vscode';

/**
 * Manages a single DiagnosticCollection for all watchers combined.
 * Supports per-watcher namespacing within the same collection so that
 * clearing one watcher's output does not erase another's.
 */
export class DiagnosticsManager {
    private readonly collection: vscode.DiagnosticCollection;

    /**
     * Internal store: filePath → watcherName → diagnostics[]
     * We re-merge into the VS Code collection on every write.
     */
    private readonly store = new Map<string, Map<string, vscode.Diagnostic[]>>();

    constructor() {
        this.collection = vscode.languages.createDiagnosticCollection('universalFileWatcher');
    }

    /** Replace all diagnostics produced by `watcherName` for `filePath`. */
    set(filePath: string, watcherName: string, diagnostics: vscode.Diagnostic[]): void {
        const fileEntry = this.store.get(filePath) ?? new Map<string, vscode.Diagnostic[]>();
        fileEntry.set(watcherName, diagnostics);
        this.store.set(filePath, fileEntry);
        this.flush(filePath);
    }

    /** Remove all diagnostics produced by `watcherName` for `filePath`. */
    clearForFileAndWatcher(filePath: string, watcherName: string): void {
        this.store.get(filePath)?.delete(watcherName);
        this.flush(filePath);
    }

    /** Remove all diagnostics for `filePath` (all watchers). */
    clearForFile(filePath: string): void {
        this.store.delete(filePath);
        this.collection.delete(vscode.Uri.file(filePath));
    }

    /** Remove all diagnostics (all files, all watchers). */
    clearAll(): void {
        this.store.clear();
        this.collection.clear();
    }

    dispose(): void {
        this.collection.dispose();
    }

    private flush(filePath: string): void {
        const fileEntry = this.store.get(filePath);
        if (!fileEntry || fileEntry.size === 0) {
            this.collection.delete(vscode.Uri.file(filePath));
            return;
        }

        const merged: vscode.Diagnostic[] = [];
        for (const diags of fileEntry.values()) {
            merged.push(...diags);
        }

        this.collection.set(vscode.Uri.file(filePath), merged);
    }
}
