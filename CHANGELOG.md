# Changelog

All notable changes to **Universal File Watcher** are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/).

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
