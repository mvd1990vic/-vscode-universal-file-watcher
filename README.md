# Universal File Watcher

**Run any external tool on file save and see its output as inline diagnostics — directly in the editor, no tool-specific plugin required.**

Inspired by PyCharm's *File Watchers*, this extension is a thin, generic bridge between VS Code and any command-line linter, type checker, formatter, or custom script.

---

## Features

| Feature | Details |
|---|---|
| **Any tool** | Works with mypy, flake8, ruff, pylint, tsc, eslint, cargo, go vet, shellcheck, your own script — anything that prints `file:line:col: message` to stdout |
| **Inline diagnostics** | Errors and warnings appear as red/yellow squiggles right in the code, just like built-in language support |
| **Regex output parser** | Map tool output to diagnostics with a single named-group regular expression — no hardcoded format assumptions |
| **Multiple watchers** | Define as many watchers as you like; they run in parallel on each save |
| **Glob patterns** | Watchers trigger only on files matching their pattern (`**/*.py`, `src/**/*.ts`, etc.) |
| **Per-run cancellation** | Saving a file again before the previous run finishes cancels the old run immediately |
| **Debounce** | Configurable delay prevents hammering tools on rapid saves |
| **Status bar** | Shows running state and error count at a glance |

---

## Quick Start

### 1 — Install the extension

```bash
git clone https://github.com/mvd1990vic/vscode-universal-file-watcher
cd vscode-universal-file-watcher
npm install
npm run compile
# Press F5 in VS Code to open an Extension Development Host
```

### 2 — Add a watcher to your project

Open `.vscode/settings.json` (create it if it doesn't exist) and add:

```jsonc
{
  "universalFileWatcher.watchers": [
    {
      "name": "mypy",
      "filePattern": "**/*.py",
      "command": "mypy --show-column-numbers --no-error-summary ${file}",
      "outputPattern": "^(?<file>[^:]+):(?<line>\\d+):(?<col>\\d+): (?<severity>error|warning|note): (?<message>.+)$"
    }
  ]
}
```

Save any `.py` file — mypy runs, and its output appears as diagnostics in the Problems panel and as squiggles in the editor.

---

## Configuration Reference

All settings live under the `universalFileWatcher` namespace.

### `universalFileWatcher.watchers` *(array)*

The heart of the extension. Each element is a watcher object.

#### Required watcher fields

| Field | Type | Description |
|---|---|---|
| `name` | `string` | Display name (shown in status bar, output channel, diagnostic source) |
| `filePattern` | `string \| string[]` | Glob pattern(s) for files that trigger this watcher |
| `command` | `string` | Command to run (supports [variables](#variables)) |
| `outputPattern` | `string` | Regex with [named capture groups](#named-capture-groups) to parse each output line |

#### Optional watcher fields

| Field | Type | Default | Description |
|---|---|---|---|
| `severity` | `"error"\|"warning"\|"info"\|"hint"` | `"error"` | Default severity when not captured by regex |
| `enabled` | `boolean` | `true` | Whether this specific watcher is active |
| `runInShell` | `boolean` | `true` | Run through system shell (allows `\|` pipes, env vars) |
| `cwd` | `string` | `"${workspaceFolder}"` | Working directory (supports [variables](#variables)) |
| `env` | `object` | `{}` | Extra environment variables |
| `encoding` | `string` | `"utf8"` | Output encoding (`utf8`, `latin1`, …) |
| `parseStderr` | `boolean` | `false` | Parse stderr in addition to stdout |
| `applyTo` | `"savedFile"\|"matchedFile"\|"allFiles"` | `"matchedFile"` | Which file gets the diagnostics (see [below](#applyto)) |
| `continuationPattern` | `string` | — | Regex for context lines printed after the main diagnostic. Matched lines are appended to the previous diagnostic's message. Supports a `message` named group. |
| `ignoreExitCodes` | `number[]` | `[]` | Exit codes that are expected (e.g. `[1]` for linters that exit with 1 on warnings). Others produce a warning in the output channel. |
| `codeUrl` | `string` | — | URL template for error code docs. Use `${code}` as placeholder — the code in the Problems panel becomes a clickable link. |

### Other settings

| Setting | Type | Default | Description |
|---|---|---|---|
| `universalFileWatcher.enabled` | `boolean` | `true` | Master on/off switch for all watchers |
| `universalFileWatcher.runOnOpen` | `boolean` | `false` | Also run when a file is first opened |
| `universalFileWatcher.clearDiagnosticsOnSave` | `boolean` | `true` | Clear previous diagnostics before each run |
| `universalFileWatcher.showOutputOnError` | `boolean` | `false` | Auto-reveal output channel when errors are found |
| `universalFileWatcher.debounceMs` | `number` | `300` | Milliseconds to wait after save before running |

---

## Variables

The following variables are expanded in `command` and `cwd`:

| Variable | Expands to |
|---|---|
| `${file}` | Absolute path of the saved file |
| `${fileBasename}` | Filename with extension (`main.py`) |
| `${fileBasenameNoExtension}` | Filename without extension (`main`) |
| `${fileDirname}` | Directory containing the file |
| `${fileExtname}` | Extension including dot (`.py`) |
| `${fileRelative}` | Path relative to workspace root |
| `${workspaceFolder}` | Absolute path of the workspace root |

---

## Named Capture Groups

The `outputPattern` regex must use **named capture groups** (`(?<name>...)`).

### Supported group names

| Group | Required | Description |
|---|---|---|
| `line` | **yes** | Line number (1-based) |
| `col` / `column` | no | Column number (1-based) |
| `endLine` | no | End of range line (1-based) |
| `endCol` | no | End of range column (1-based) |
| `severity` | no | `error`, `warning`, `note`, `info`, `hint` (overrides watcher default) |
| `message` | **yes** | Human-readable description |
| `code` | no | Error code (e.g. `E501`, `TS2304`) — shown in Problems panel |
| `file` | no | File path — used when `applyTo` is `matchedFile` or `allFiles` |

### `applyTo`

| Value | Behaviour |
|---|---|
| `savedFile` | All diagnostics go to the file that was just saved |
| `matchedFile` | Diagnostics go to the file in the `file` capture group (falls back to saved file) |
| `allFiles` | Diagnostics go to the captured file **and** the saved file |

Use `savedFile` when the tool only checks one file at a time (`mypy ${file}`).
Use `matchedFile` when the tool checks the whole project and reports many files (`tsc --noEmit`, `cargo check`).

---

## Examples

### Python — mypy

```jsonc
{
  "name": "mypy",
  "filePattern": "**/*.py",
  "command": "mypy --show-column-numbers --no-error-summary ${file}",
  "outputPattern": "^(?<file>[^:]+):(?<line>\\d+):(?<col>\\d+): (?<severity>error|warning): (?<message>.+?)(?:\\s+\\[(?<code>[a-z-]+)\\])?$",
  "continuationPattern": "^(?<file>[^:]+):(?<line>\\d+):(?<col>\\d+): note: (?<message>.+)$",
  "codeUrl": "https://mypy.readthedocs.io/en/stable/error_codes.html#${code}",
  "ignoreExitCodes": [1]
}
```

### Python — flake8

```jsonc
{
  "name": "flake8",
  "filePattern": "**/*.py",
  "command": "flake8 ${file}",
  "outputPattern": "^(?<file>[^:]+):(?<line>\\d+):(?<col>\\d+): (?<code>[A-Z]\\d+) (?<message>.+)$",
  "severity": "warning"
}
```

### Python — ruff

```jsonc
{
  "name": "ruff",
  "filePattern": "**/*.py",
  "command": "ruff check --output-format=text ${file}",
  "outputPattern": "^(?<file>[^:]+):(?<line>\\d+):(?<col>\\d+): (?<code>[A-Z]\\d+) (?<message>.+)$",
  "severity": "warning"
}
```

### TypeScript — tsc (whole project)

```jsonc
{
  "name": "tsc",
  "filePattern": ["**/*.ts", "**/*.tsx"],
  "command": "npx tsc --noEmit --pretty false",
  "outputPattern": "^(?<file>[^(]+)\\((?<line>\\d+),(?<col>\\d+)\\): (?<severity>error|warning) TS(?<code>\\d+): (?<message>.+)$",
  "cwd": "${workspaceFolder}",
  "applyTo": "matchedFile"
}
```

### JavaScript/TypeScript — ESLint

```jsonc
{
  "name": "eslint",
  "filePattern": ["**/*.js", "**/*.ts", "**/*.jsx", "**/*.tsx"],
  "command": "npx eslint --format=unix ${file}",
  "outputPattern": "^(?<file>[^:]+):(?<line>\\d+):(?<col>\\d+): (?<message>.+) \\[(?<severity>Error|Warning)/(?<code>.+)\\]$",
  "severity": "warning"
}
```

### Rust — cargo check

```jsonc
{
  "name": "cargo check",
  "filePattern": "**/*.rs",
  "command": "cargo check --message-format=short 2>&1",
  "outputPattern": "^(?<file>[^:]+):(?<line>\\d+):(?<col>\\d+): (?<severity>error|warning)(?:\\[(?<code>[^\\]]+)\\])?: (?<message>.+)$",
  "cwd": "${workspaceFolder}",
  "applyTo": "matchedFile"
}
```

### Shell — shellcheck

```jsonc
{
  "name": "shellcheck",
  "filePattern": ["**/*.sh", "**/*.bash"],
  "command": "shellcheck -f gcc ${file}",
  "outputPattern": "^(?<file>[^:]+):(?<line>\\d+):(?<col>\\d+): (?<severity>error|warning|note): (?<message>.+)$",
  "severity": "warning"
}
```

### Custom script

```jsonc
{
  "name": "my-checker",
  "filePattern": "**/*.py",
  "command": "python ${workspaceFolder}/scripts/check.py ${file}",
  "outputPattern": "^(?<file>[^:]+):(?<line>\\d+):(?<col>\\d+): (?<severity>error|warning): (?<message>.+)$",
  "cwd": "${workspaceFolder}",
  "env": {
    "MY_API_KEY": "...",
    "PYTHONPATH": "${workspaceFolder}/src"
  }
}
```

More examples are in the [`examples/`](examples/) directory.

---

## Commands

Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

| Command | Description |
|---|---|
| `File Watcher: Run on Current File` | Immediately run all matching watchers on the active editor |
| `File Watcher: Clear All Diagnostics` | Remove all diagnostics produced by this extension |
| `File Watcher: Enable` | Enable all watchers for this workspace |
| `File Watcher: Disable` | Disable all watchers for this workspace |
| `File Watcher: Show Output Channel` | Open the raw command output panel |

---

## Development

### Prerequisites

- Node.js 20+
- VS Code 1.85+

### Setup

```bash
git clone https://github.com/mvd1990vic/vscode-universal-file-watcher
cd vscode-universal-file-watcher
npm install
```

### Compile and run

```bash
npm run compile    # one-time build
npm run watch      # watch mode (recompiles on change)
```

Press `F5` in VS Code to open an **Extension Development Host** with the extension loaded.

### Lint

```bash
npm run lint
```

### Package as `.vsix`

```bash
npm run package
# produces universal-file-watcher-1.0.0.vsix
```

Install locally:

```bash
code --install-extension universal-file-watcher-1.0.0.vsix
```

---

## Troubleshooting

**No diagnostics appear**

1. Open **File Watcher: Show Output Channel** and check the raw output.
2. Verify the command runs correctly in your terminal with the exact file path.
3. Check that `outputPattern` matches your tool's actual output format — test in [regex101.com](https://regex101.com/) with the ECMAScript flavor.
4. Make sure `filePattern` matches the file you saved (e.g., `**/*.py` requires the path to end in `.py`).

**Command not found**

- Set `"runInShell": true` (default) so the shell PATH is inherited.
- Or use the full path: `"command": "/usr/local/bin/mypy ${file}"`.
- For virtualenv/conda: prefix the command, e.g. `"command": "source .venv/bin/activate && mypy ${file}"`.

**Diagnostics on wrong file**

- If the tool checks the whole project (e.g., `tsc --noEmit`), set `"applyTo": "matchedFile"` and make sure the `file` capture group is in your regex.
- If the tool only checks one file, use `"applyTo": "savedFile"` (default).

**Too slow / running too often**

- Increase `universalFileWatcher.debounceMs` (default 300 ms).
- Disable watchers you don't need with `"enabled": false`.

---

## Contributing

Pull requests and issues are welcome. Please open an issue first for significant changes.

---

## License

[MIT](LICENSE)
