import { describe, it, expect, beforeEach } from 'vitest';
import { toVscodeSeverity, expandVariables, getExtensionConfig } from '../config.js';
import { DiagnosticSeverity, __setConfig, __resetConfig } from 'vscode';
import type { WatcherConfig } from '../config.js';
import type { Uri } from 'vscode';

// ---------------------------------------------------------------------------
// toVscodeSeverity
// ---------------------------------------------------------------------------

describe('toVscodeSeverity', () => {
    it.each([
        ['error',       DiagnosticSeverity.Error],
        ['ERROR',       DiagnosticSeverity.Error],
        ['warning',     DiagnosticSeverity.Warning],
        ['warn',        DiagnosticSeverity.Warning],
        ['WARN',        DiagnosticSeverity.Warning],
        ['info',        DiagnosticSeverity.Information],
        ['information', DiagnosticSeverity.Information],
        ['note',        DiagnosticSeverity.Information],
        ['hint',        DiagnosticSeverity.Hint],
    ])('"%s" → %i', (input, expected) => {
        expect(toVscodeSeverity(input)).toBe(expected);
    });

    it('falls back to Error for unknown values', () => {
        expect(toVscodeSeverity('unknown')).toBe(DiagnosticSeverity.Error);
        expect(toVscodeSeverity('')).toBe(DiagnosticSeverity.Error);
    });
});

// ---------------------------------------------------------------------------
// expandVariables
// ---------------------------------------------------------------------------

describe('expandVariables', () => {
    const fileUri = { fsPath: '/workspace/src/main.py' } as Uri;
    const wsFolder = { uri: { fsPath: '/workspace' } } as any;

    it('expands ${file}', () => {
        expect(expandVariables('${file}', fileUri, wsFolder)).toBe('/workspace/src/main.py');
    });

    it('expands ${fileBasename}', () => {
        expect(expandVariables('${fileBasename}', fileUri, wsFolder)).toBe('main.py');
    });

    it('expands ${fileBasenameNoExtension}', () => {
        expect(expandVariables('${fileBasenameNoExtension}', fileUri, wsFolder)).toBe('main');
    });

    it('expands ${fileDirname}', () => {
        expect(expandVariables('${fileDirname}', fileUri, wsFolder)).toBe('/workspace/src');
    });

    it('expands ${fileExtname}', () => {
        expect(expandVariables('${fileExtname}', fileUri, wsFolder)).toBe('.py');
    });

    it('expands ${fileRelative}', () => {
        expect(expandVariables('${fileRelative}', fileUri, wsFolder)).toBe('src/main.py');
    });

    it('expands ${workspaceFolder}', () => {
        expect(expandVariables('${workspaceFolder}', fileUri, wsFolder)).toBe('/workspace');
    });

    it('expands multiple variables in one string', () => {
        const result = expandVariables('mypy ${file} --config ${workspaceFolder}/mypy.ini', fileUri, wsFolder);
        expect(result).toBe('mypy /workspace/src/main.py --config /workspace/mypy.ini');
    });

    it('uses file dirname as workspace fallback when no wsFolder', () => {
        expect(expandVariables('${workspaceFolder}', fileUri, undefined)).toBe('/workspace/src');
    });
});

// ---------------------------------------------------------------------------
// getExtensionConfig
// ---------------------------------------------------------------------------

describe('getExtensionConfig', () => {
    beforeEach(() => __resetConfig());

    it('returns defaults when config is empty', () => {
        const cfg = getExtensionConfig();
        expect(cfg.enabled).toBe(true);
        expect(cfg.runOnOpen).toBe(false);
        expect(cfg.clearDiagnosticsOnSave).toBe(true);
        expect(cfg.showOutputOnError).toBe(false);
        expect(cfg.debounceMs).toBe(300);
        expect(cfg.watchers).toEqual([]);
    });

    it('reads top-level settings from config', () => {
        __setConfig({
            enabled: false,
            debounceMs: 500,
            runOnOpen: true,
        });
        const cfg = getExtensionConfig();
        expect(cfg.enabled).toBe(false);
        expect(cfg.debounceMs).toBe(500);
        expect(cfg.runOnOpen).toBe(true);
    });

    it('applies watcher defaults', () => {
        __setConfig({
            watchers: [{ name: 'w', filePattern: '**/*.py', command: 'mypy', outputPattern: '.*' }],
        });
        const cfg = getExtensionConfig();
        const w = cfg.watchers[0] as WatcherConfig;
        expect(w.name).toBe('w');
        expect(w.severity).toBe('error');
        expect(w.enabled).toBe(true);
        expect(w.runInShell).toBe(true);
        expect(w.applyTo).toBe('matchedFile');
        expect(w.ignoreExitCodes).toEqual([]);
        expect(w.continuationPattern).toBeUndefined();
        expect(w.codeUrl).toBeUndefined();
    });

    it('reads all watcher fields', () => {
        __setConfig({
            watchers: [{
                name: 'mypy',
                filePattern: '**/*.py',
                command: 'mypy ${file}',
                outputPattern: '.*',
                severity: 'warning',
                enabled: false,
                runInShell: false,
                cwd: '/tmp',
                env: { MYPYPATH: '/src' },
                encoding: 'latin1',
                parseStderr: true,
                applyTo: 'savedFile',
                ignoreExitCodes: [1, 2],
                continuationPattern: '^note:',
                codeUrl: 'https://example.com/${code}',
            }],
        });
        const w = getExtensionConfig().watchers[0] as WatcherConfig;
        expect(w.severity).toBe('warning');
        expect(w.enabled).toBe(false);
        expect(w.runInShell).toBe(false);
        expect(w.cwd).toBe('/tmp');
        expect(w.env).toEqual({ MYPYPATH: '/src' });
        expect(w.encoding).toBe('latin1');
        expect(w.parseStderr).toBe(true);
        expect(w.applyTo).toBe('savedFile');
        expect(w.ignoreExitCodes).toEqual([1, 2]);
        expect(w.continuationPattern).toBe('^note:');
        expect(w.codeUrl).toBe('https://example.com/${code}');
    });
});
