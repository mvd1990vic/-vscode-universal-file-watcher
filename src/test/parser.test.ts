import { describe, it, expect } from 'vitest';
import { parseLine, parseOutput } from '../parser.js';
import { DiagnosticSeverity } from 'vscode';
import type { WatcherConfig } from '../config.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWatcher(overrides: Partial<WatcherConfig> = {}): WatcherConfig {
    return {
        name: 'test',
        filePattern: '**/*',
        command: '',
        outputPattern: '^(?<file>[^:]+):(?<line>\\d+):(?<col>\\d+): (?<severity>\\w+): (?<message>.+)$',
        continuationPattern: undefined,
        severity: 'error',
        enabled: true,
        runInShell: true,
        cwd: '${workspaceFolder}',
        env: {},
        encoding: 'utf8',
        parseStderr: false,
        applyTo: 'matchedFile',
        ignoreExitCodes: [],
        codeUrl: undefined,
        ...overrides,
    };
}

const SAVED = '/workspace/current.py';
const WS = '/workspace';

// ---------------------------------------------------------------------------
// parseLine
// ---------------------------------------------------------------------------

describe('parseLine', () => {
    it('parses a full match correctly', () => {
        const result = parseLine(
            '/workspace/foo.py:10:5: error: Something went wrong',
            makeWatcher(),
            SAVED,
            WS,
        );
        expect(result).not.toBeNull();
        expect(result!.file).toBe('/workspace/foo.py');
        expect(result!.diagnostic.range.start.line).toBe(9);
        expect(result!.diagnostic.range.start.character).toBe(4);
        expect(result!.diagnostic.message).toBe('Something went wrong');
        expect(result!.diagnostic.severity).toBe(DiagnosticSeverity.Error);
    });

    it('returns null when line does not match', () => {
        const result = parseLine('not a diagnostic line', makeWatcher(), SAVED, WS);
        expect(result).toBeNull();
    });

    it('returns null on invalid regex', () => {
        const result = parseLine('any line', makeWatcher({ outputPattern: '(?<bad' }), SAVED, WS);
        expect(result).toBeNull();
    });

    it('falls back to line 0 when no line group', () => {
        const result = parseLine(
            'error: oops',
            makeWatcher({ outputPattern: '^(?<severity>error): (?<message>.+)$' }),
            SAVED,
            WS,
        );
        expect(result!.diagnostic.range.start.line).toBe(0);
    });

    it('underlines whole line when no col group', () => {
        const result = parseLine(
            'foo.py:5: error: bad',
            makeWatcher({ outputPattern: '^(?<file>[^:]+):(?<line>\\d+): (?<severity>\\w+): (?<message>.+)$' }),
            SAVED,
            WS,
        );
        expect(result!.diagnostic.range.end.character).toBe(Number.MAX_SAFE_INTEGER);
        expect(result!.needsWordExpansion).toBe(false);
    });

    it('sets needsWordExpansion=true when col given but no endCol', () => {
        const result = parseLine(
            'foo.py:5:3: error: bad',
            makeWatcher(),
            SAVED,
            WS,
        );
        expect(result!.needsWordExpansion).toBe(true);
        expect(result!.diagnostic.range.start.character).toBe(2);
    });

    it('uses exact range when endCol is given', () => {
        const result = parseLine(
            'foo.py:5:3:5:10: error: bad',
            makeWatcher({
                outputPattern: '^(?<file>[^:]+):(?<line>\\d+):(?<col>\\d+):(?<endLine>\\d+):(?<endCol>\\d+): (?<severity>\\w+): (?<message>.+)$',
            }),
            SAVED,
            WS,
        );
        expect(result!.needsWordExpansion).toBe(false);
        expect(result!.diagnostic.range.end.character).toBe(9);
    });

    it('severity from capture group overrides watcher default', () => {
        const result = parseLine(
            'foo.py:1:1: warning: something',
            makeWatcher({ severity: 'error' }),
            SAVED,
            WS,
        );
        expect(result!.diagnostic.severity).toBe(DiagnosticSeverity.Warning);
    });

    it('falls back to watcher severity when no group', () => {
        const result = parseLine(
            'foo.py:1:1: something',
            makeWatcher({
                outputPattern: '^(?<file>[^:]+):(?<line>\\d+):(?<col>\\d+): (?<message>.+)$',
                severity: 'hint',
            }),
            SAVED,
            WS,
        );
        expect(result!.diagnostic.severity).toBe(DiagnosticSeverity.Hint);
    });

    it('uses full line as message when no message group', () => {
        const line = 'foo.py:1:1: error';
        const result = parseLine(
            line,
            makeWatcher({ outputPattern: '^(?<file>[^:]+):(?<line>\\d+):(?<col>\\d+): (?<severity>\\w+)$' }),
            SAVED,
            WS,
        );
        expect(result!.diagnostic.message).toBe(line);
    });

    it('resolves relative file path against workspaceFolderPath', () => {
        const result = parseLine(
            'src/foo.py:1:1: error: bad',
            makeWatcher(),
            SAVED,
            WS,
        );
        expect(result!.file).toBe('/workspace/src/foo.py');
    });

    it('keeps absolute file path as-is', () => {
        const result = parseLine(
            '/other/foo.py:1:1: error: bad',
            makeWatcher(),
            SAVED,
            WS,
        );
        expect(result!.file).toBe('/other/foo.py');
    });

    it('sets code as string when no codeUrl', () => {
        const result = parseLine(
            'foo.py:1:1: error: bad [E001]',
            makeWatcher({
                outputPattern: '^(?<file>[^:]+):(?<line>\\d+):(?<col>\\d+): (?<severity>\\w+): (?<message>.+) \\[(?<code>[A-Z]\\d+)\\]$',
            }),
            SAVED,
            WS,
        );
        expect(result!.diagnostic.code).toBe('E001');
    });

    it('sets code as { value, target } when codeUrl given', () => {
        const result = parseLine(
            'foo.py:1:1: error: bad [E001]',
            makeWatcher({
                outputPattern: '^(?<file>[^:]+):(?<line>\\d+):(?<col>\\d+): (?<severity>\\w+): (?<message>.+) \\[(?<code>[A-Z]\\d+)\\]$',
                codeUrl: 'https://example.com/errors/${code}',
            }),
            SAVED,
            WS,
        );
        const code = result!.diagnostic.code as { value: string; target: { toString(): string } };
        expect(code.value).toBe('E001');
        expect(code.target.toString()).toBe('https://example.com/errors/E001');
    });

    it('encodes special characters in codeUrl', () => {
        const result = parseLine(
            'foo.py:1:1: error: bad [no-unused-vars]',
            makeWatcher({
                outputPattern: '^(?<file>[^:]+):(?<line>\\d+):(?<col>\\d+): (?<severity>\\w+): (?<message>.+) \\[(?<code>[\\w-]+)\\]$',
                codeUrl: 'https://example.com/rules/${code}',
            }),
            SAVED,
            WS,
        );
        const code = result!.diagnostic.code as { value: string; target: { toString(): string } };
        expect(code.target.toString()).toBe('https://example.com/rules/no-unused-vars');
    });

    it('attaches undefined file when no file group', () => {
        const result = parseLine(
            '1:1: error: bad',
            makeWatcher({ outputPattern: '^(?<line>\\d+):(?<col>\\d+): (?<severity>\\w+): (?<message>.+)$' }),
            SAVED,
            WS,
        );
        expect(result!.file).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// parseOutput
// ---------------------------------------------------------------------------

describe('parseOutput', () => {
    it('returns empty map for empty output', () => {
        const { diagMap } = parseOutput('', '', makeWatcher(), SAVED, WS);
        expect(diagMap.size).toBe(0);
    });

    it('parses multiple lines into separate diagnostics', () => {
        const stdout = [
            '/workspace/a.py:1:1: error: First',
            '/workspace/b.py:2:2: warning: Second',
        ].join('\n');
        const { diagMap } = parseOutput(stdout, '', makeWatcher(), SAVED, WS);
        expect(diagMap.get('/workspace/a.py')).toHaveLength(1);
        expect(diagMap.get('/workspace/b.py')).toHaveLength(1);
    });

    it('skips blank lines', () => {
        const stdout = '\n\n/workspace/a.py:1:1: error: Only one\n\n';
        const { diagMap } = parseOutput(stdout, '', makeWatcher(), SAVED, WS);
        expect([...diagMap.values()].flat()).toHaveLength(1);
    });

    it('applyTo=savedFile always routes to savedFilePath', () => {
        const stdout = '/workspace/other.py:1:1: error: Problem';
        const { diagMap } = parseOutput(stdout, '', makeWatcher({ applyTo: 'savedFile' }), SAVED, WS);
        expect(diagMap.has(SAVED)).toBe(true);
        expect(diagMap.has('/workspace/other.py')).toBe(false);
    });

    it('applyTo=matchedFile routes to captured file', () => {
        const stdout = '/workspace/other.py:1:1: error: Problem';
        const { diagMap } = parseOutput(stdout, '', makeWatcher({ applyTo: 'matchedFile' }), SAVED, WS);
        expect(diagMap.has('/workspace/other.py')).toBe(true);
        expect(diagMap.has(SAVED)).toBe(false);
    });

    it('applyTo=matchedFile falls back to savedFile when no file group', () => {
        const stdout = '1:1: error: no file';
        const { diagMap } = parseOutput(
            stdout, '',
            makeWatcher({
                applyTo: 'matchedFile',
                outputPattern: '^(?<line>\\d+):(?<col>\\d+): (?<severity>\\w+): (?<message>.+)$',
            }),
            SAVED,
            WS,
        );
        expect(diagMap.has(SAVED)).toBe(true);
    });

    it('applyTo=allFiles routes to both files', () => {
        const stdout = '/workspace/other.py:1:1: error: Problem';
        const { diagMap } = parseOutput(stdout, '', makeWatcher({ applyTo: 'allFiles' }), SAVED, WS);
        expect(diagMap.has('/workspace/other.py')).toBe(true);
        expect(diagMap.has(SAVED)).toBe(true);
    });

    it('parses stderr when parseStderr=true', () => {
        const { diagMap } = parseOutput(
            '',
            '/workspace/a.py:1:1: error: From stderr',
            makeWatcher({ parseStderr: true }),
            SAVED,
            WS,
        );
        expect([...diagMap.values()].flat()).toHaveLength(1);
    });

    it('ignores stderr when parseStderr=false', () => {
        const { diagMap } = parseOutput(
            '',
            '/workspace/a.py:1:1: error: From stderr',
            makeWatcher({ parseStderr: false }),
            SAVED,
            WS,
        );
        expect(diagMap.size).toBe(0);
    });

    it('tracks needsWordExpansion in wordExpansionSet', () => {
        const stdout = '/workspace/a.py:1:5: error: col given';
        const { diagMap, wordExpansionSet } = parseOutput(stdout, '', makeWatcher(), SAVED, WS);
        const diag = diagMap.get('/workspace/a.py')![0];
        expect(wordExpansionSet.has(diag)).toBe(true);
    });

    it('does not add to wordExpansionSet when no col', () => {
        const stdout = '/workspace/a.py:1: error: no col';
        const { diagMap, wordExpansionSet } = parseOutput(
            stdout, '',
            makeWatcher({ outputPattern: '^(?<file>[^:]+):(?<line>\\d+): (?<severity>\\w+): (?<message>.+)$' }),
            SAVED,
            WS,
        );
        const diag = diagMap.get('/workspace/a.py')![0];
        expect(wordExpansionSet.has(diag)).toBe(false);
    });

    // --- continuationPattern ---

    it('appends continuation lines to the previous diagnostic', () => {
        const stdout = [
            '/workspace/a.py:1:1: error: Main message',
            '  note: See also this context',
        ].join('\n');
        const { diagMap } = parseOutput(
            stdout, '',
            makeWatcher({ continuationPattern: '^\\s+note: (?<message>.+)$' }),
            SAVED,
            WS,
        );
        const diag = diagMap.get('/workspace/a.py')![0];
        expect(diag.message).toBe('Main message\nSee also this context');
    });

    it('falls back to full line when continuation has no message group', () => {
        const stdout = [
            '/workspace/a.py:1:1: error: Main',
            '  ^ extra context here',
        ].join('\n');
        const { diagMap } = parseOutput(
            stdout, '',
            makeWatcher({ continuationPattern: '^\\s+\\^.+$' }),
            SAVED,
            WS,
        );
        const diag = diagMap.get('/workspace/a.py')![0];
        expect(diag.message).toBe('Main\n^ extra context here');
    });

    it('resets continuation context on empty line', () => {
        const stdout = [
            '/workspace/a.py:1:1: error: First',
            '',
            '/workspace/a.py:2:1: error: Second',
            '  note: Belongs to second',
        ].join('\n');
        const { diagMap } = parseOutput(
            stdout, '',
            makeWatcher({ continuationPattern: '^\\s+note: (?<message>.+)$' }),
            SAVED,
            WS,
        );
        const diags = diagMap.get('/workspace/a.py')!;
        expect(diags).toHaveLength(2);
        expect(diags[0].message).toBe('First');
        expect(diags[1].message).toBe('Second\nBelongs to second');
    });

    it('ignores continuation lines when no previous diagnostic', () => {
        const stdout = '  note: orphan context';
        const { diagMap } = parseOutput(
            stdout, '',
            makeWatcher({ continuationPattern: '^\\s+note: (?<message>.+)$' }),
            SAVED,
            WS,
        );
        expect(diagMap.size).toBe(0);
    });

    it('ignores continuation when continuationPattern is invalid regex', () => {
        const stdout = [
            '/workspace/a.py:1:1: error: Main',
            '  note: extra',
        ].join('\n');
        const { diagMap } = parseOutput(
            stdout, '',
            makeWatcher({ continuationPattern: '(?<bad' }),
            SAVED,
            WS,
        );
        const diag = diagMap.get('/workspace/a.py')![0];
        expect(diag.message).toBe('Main');
    });
});
