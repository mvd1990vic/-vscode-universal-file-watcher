# Changelog

All notable changes to **Universal File Watcher** are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/).

---

## [1.5.1] — 2026-04-03

### Fixed
- TypeScript compilation error in `matchesPattern` signature (`readonly string[]` removed).

---

## [1.5.0] — 2026-04-03

### Added
- `excludePatterns` on each watcher — glob pattern(s) to skip that specific watcher for matching files (e.g. `["**/.venv/**"]`).
- Global `universalFileWatcher.excludePatterns` setting — glob pattern(s) that prevent any watcher from running on matching files.

---

## [1.4.5] — 2026-04-02

### Added
- Extension icon (`images/icon.png`) — resized from 1024×1024 to 128×128 (11 KB) and registered via `"icon"` field in `package.json`.

---

## [1.4.4] — 2026-04-02

### Fixed
- Restored correct GitHub repository URLs (`mvd1990vic`) in `package.json` — publisher ID and GitHub username are independent.

---

## [1.4.3] — 2026-04-02

### Changed
- Publisher ID changed from `mvd1990vic` to `VictorMalyshkin` across `package.json`, README and CLAUDE.md.

---

## [1.4.2] — 2026-04-02

### Changed
- README: added verified `codeUrl` templates for ruff, ESLint, shellcheck and mypy examples.
- Fixed mypy `codeUrl` anchor prefix: `#code-${code}` (was `#${code}`).
- Updated shellcheck `outputPattern` to capture the `SC\d+` code group, enabling the `codeUrl` link.
- Added `ignoreExitCodes: [1]` to ruff and ESLint examples.

---

## [1.4.1] — 2026-04-02

### Fixed
- Excluded `__mocks__/`, `vitest.config.ts` and `src/test` from `tsconfig.json` so `tsc` no longer errors on files outside `rootDir`.

---

## [1.4.0] — 2026-04-02

### Added
- Unit test suite with vitest (55 tests, no VS Code needed).
- `__mocks__/vscode.ts` — minimal vscode API mock for tests.
- CI now runs `npm test` before compile on every push.

---

## [1.3.0] — 2026-04-02

### Added
- `continuationPattern` — regex for context lines printed after the main diagnostic; matched lines are appended to the previous diagnostic's message. Empty line resets context.
- `ignoreExitCodes` — non-zero exit codes not in this list are logged as unexpected in the Output Channel.
- `codeUrl` — URL template with `${code}` placeholder; makes error codes in the Problems panel clickable links to documentation.

---

## [1.2.1] — 2026-04-02

### Fixed
- Changed default `applyTo` from `savedFile` to `matchedFile`. Tools that scan the whole project were attaching all diagnostics to the saved file instead of the actual files that contain errors.

---

## [1.2.0] — 2026-04-02

### Added
- All settings are now `scope: resource` — each folder in a multi-root workspace can independently override `watchers` and all other settings.
- `getExtensionConfig` accepts a `fileUri` so per-folder configuration is read correctly.

---

## [1.1.0] — 2026-03-31

### Added
- When no `col` group is captured, the whole line is underlined.
- When no `line` group is captured, the diagnostic is placed on line 0 (first line of file).
- When `col` is captured but `endCol` is not, the entire word at that position is underlined instead of a single character.

---

## [1.0.0] — 2024-01-01

### Added
- First stable release.
- Run any external command on file save, triggered by glob patterns.
- Parse command output into VS Code diagnostics using named-group regex.
- Supported capture groups: `file`, `line`, `col`, `endLine`, `endCol`, `severity`, `code`, `message`.
- Three diagnostic attachment strategies: `savedFile`, `matchedFile`, `allFiles`.
- Master enable/disable toggle and per-watcher `enabled` flag.
- Debouncing to avoid running on every rapid keystroke-save.
- AbortController-based cancellation — starting a new save cancels the previous in-flight run.
- Status bar item showing running state and error count.
- Output channel with full raw command output.
- Commands: Run on Current File, Clear All Diagnostics, Enable, Disable, Show Output.
- Built-in example configs for mypy, flake8, ruff, pylint, ESLint, tsc, cargo, go vet, shellcheck, hadolint.
- GitHub Actions CI workflow (build + marketplace publish on release).
