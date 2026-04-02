# CLAUDE.md

## Project

VS Code extension — **Universal File Watcher**. Runs any CLI tool on file save and displays its output as inline diagnostics (squiggles + Problems panel). No tool-specific plugin needed.

Publisher: `mvd1990vic`
Repo: `github.com/mvd1990vic/-vscode-universal-file-watcher`

## Architecture

```
src/
  extension.ts   — activation, event listeners, scheduleRun, runAllMatchingWatchers
  config.ts      — WatcherConfig interface, getExtensionConfig(resource?), expandVariables
  runner.ts      — spawns the CLI process, returns stdout/stderr/exitCode
  parser.ts      — parseLine, parseOutput — regex → vscode.Diagnostic
  diagnostics.ts — DiagnosticsManager (namespaced DiagnosticCollection per watcher)
  statusBar.ts   — StatusBarManager
```

Data flow: `save → scheduleRun → runAllMatchingWatchers → runWatcher → parseOutput → expandWordRanges → DiagnosticsManager`

## Key behaviors

- Config is `scope: resource` — every workspace folder can override `watchers` independently
- `getExtensionConfig(fileUri)` must always receive the file's URI so per-folder settings are read correctly
- `applyTo` default is `matchedFile` — diagnostics follow the `file` capture group, fall back to saved file
- Range logic: no `col` → whole line (`MAX_SAFE_INTEGER`); `col` without `endCol` → word expansion via `expandWordRanges` (opens document, walks `\w` boundaries); `endCol` → exact range
- `continuationPattern` lines are appended to the previous diagnostic's message; empty line resets context
- `ignoreExitCodes` — non-zero codes not in the list get a `⚠` warning in the Output Channel (parsing always runs regardless)
- `codeUrl` with `${code}` placeholder sets `diagnostic.code = { value, target }` → clickable link in Problems panel

## Commands

```bash
npm run compile      # tsc one-shot
npm run watch        # tsc watch
npm run lint         # eslint src/
npm run test         # vitest run (all tests)
npm run test:watch   # vitest watch mode
npm run package      # vsce package → .vsix
```

## Tests

Unit tests use **vitest** — no VS Code needed, runs in pure Node.js.

- `__mocks__/vscode.ts` — mock of the vscode API (Range, Diagnostic, Uri, workspace, etc.)
- `vitest.config.ts` — aliases `vscode` → the mock, resolves `.js` imports to `.ts`
- `src/test/parser.test.ts` — tests for `parseLine` and `parseOutput`
- `src/test/config.test.ts` — tests for `toVscodeSeverity`, `expandVariables`, `getExtensionConfig`

**Rule: write tests for every new feature before committing.** Run `npm test` after changes to confirm nothing is broken.

## Releases

Releases are handled by Claude. Workflow:
1. Update `CHANGELOG.md` — add a new `## [X.Y.Z] — YYYY-MM-DD` section with `### Added / Fixed / Changed` entries describing what changed.
2. Bump `version` in `package.json`.
3. `git commit`, `git tag vX.Y.Z`, `git push && git push origin vX.Y.Z`
4. GitHub Actions (`.github/workflows/ci.yml`) builds the `.vsix` and attaches it to the GitHub Release automatically on `v*` tags.

`.vsix` files are in `.gitignore` — never commit them.
