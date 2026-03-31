import * as cp from 'child_process';
import * as vscode from 'vscode';
import { WatcherConfig, expandVariables } from './config.js';

export interface RunResult {
    stdout: string;
    stderr: string;
    exitCode: number;
    /** True if the run was cancelled before completion. */
    cancelled: boolean;
}

/**
 * Spawn the watcher command for the given file.
 * Returns a promise that resolves with combined stdout/stderr output.
 * Pass an AbortSignal to cancel a previous run.
 */
export function runWatcher(
    watcher: WatcherConfig,
    fileUri: vscode.Uri,
    workspaceFolder: vscode.WorkspaceFolder | undefined,
    signal: AbortSignal,
    outputChannel: vscode.OutputChannel,
): Promise<RunResult> {
    return new Promise(resolve => {
        const command = expandVariables(watcher.command, fileUri, workspaceFolder);
        const cwd = expandVariables(watcher.cwd, fileUri, workspaceFolder);
        const env = { ...process.env, ...watcher.env };

        outputChannel.appendLine(`\n▶ [${watcher.name}] ${command}`);
        outputChannel.appendLine(`  cwd: ${cwd}`);

        const spawnOptions: cp.SpawnOptions = {
            cwd,
            env,
            shell: watcher.runInShell,
            windowsHide: true,
        };

        const child = watcher.runInShell
            ? cp.spawn(command, [], spawnOptions)
            : cp.spawn(command.split(' ')[0], command.split(' ').slice(1), spawnOptions);

        let stdout = '';
        let stderr = '';

        child.stdout?.on('data', (data: Buffer) => {
            const chunk = data.toString(watcher.encoding);
            stdout += chunk;
            outputChannel.append(chunk);
        });

        child.stderr?.on('data', (data: Buffer) => {
            const chunk = data.toString(watcher.encoding);
            stderr += chunk;
            if (watcher.parseStderr) {
                outputChannel.append(chunk);
            } else {
                outputChannel.append(`[stderr] ${chunk}`);
            }
        });

        const cleanup = () => {
            if (!child.killed) {
                child.kill();
            }
        };

        signal.addEventListener('abort', cleanup, { once: true });

        child.on('close', (code) => {
            signal.removeEventListener('abort', cleanup);

            if (signal.aborted) {
                outputChannel.appendLine(`  ⚡ [${watcher.name}] Cancelled.`);
                resolve({ stdout, stderr, exitCode: code ?? -1, cancelled: true });
                return;
            }

            outputChannel.appendLine(`  ✓ [${watcher.name}] Exit code: ${code ?? '?'}`);
            resolve({ stdout, stderr, exitCode: code ?? 0, cancelled: false });
        });

        child.on('error', (err) => {
            signal.removeEventListener('abort', cleanup);
            outputChannel.appendLine(`  ✗ [${watcher.name}] Error: ${err.message}`);
            if (!signal.aborted) {
                vscode.window.showErrorMessage(
                    `Universal File Watcher: Failed to run "${watcher.name}": ${err.message}`
                );
            }
            resolve({ stdout, stderr, exitCode: -1, cancelled: signal.aborted });
        });
    });
}
