import * as vscode from 'vscode';

export class StatusBarManager {
    private readonly item: vscode.StatusBarItem;
    private runningCount = 0;
    private enabled = true;

    constructor() {
        this.item = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100,
        );
        this.item.command = 'universalFileWatcher.showOutput';
        this.update();
        this.item.show();
    }

    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        this.update();
    }

    startRun(watcherName: string): void {
        this.runningCount++;
        this.item.text = `$(sync~spin) File Watcher: ${watcherName}`;
        this.item.tooltip = 'Universal File Watcher — running…';
    }

    endRun(errorCount: number): void {
        this.runningCount = Math.max(0, this.runningCount - 1);
        if (this.runningCount === 0) {
            this.update(errorCount);
        }
    }

    private update(errorCount?: number): void {
        if (!this.enabled) {
            this.item.text = '$(eye-closed) File Watcher: disabled';
            this.item.tooltip = 'Universal File Watcher — disabled. Click to show output.';
            this.item.backgroundColor = undefined;
            return;
        }

        if (errorCount !== undefined && errorCount > 0) {
            this.item.text = `$(error) File Watcher: ${errorCount} issue${errorCount !== 1 ? 's' : ''}`;
            this.item.tooltip = `Universal File Watcher — ${errorCount} diagnostic(s) found. Click to show output.`;
            this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        } else {
            this.item.text = '$(eye) File Watcher';
            this.item.tooltip = 'Universal File Watcher — active. Click to show output.';
            this.item.backgroundColor = undefined;
        }
    }

    dispose(): void {
        this.item.dispose();
    }
}
