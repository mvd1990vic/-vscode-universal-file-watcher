/**
 * Minimal vscode API mock for unit tests.
 * Only the parts actually used by parser.ts and config.ts are implemented.
 */

export class Position {
    constructor(
        public readonly line: number,
        public readonly character: number,
    ) {}
}

export class Range {
    public readonly start: Position;
    public readonly end: Position;

    constructor(startLine: number, startChar: number, endLine: number, endChar: number) {
        this.start = new Position(startLine, startChar);
        this.end = new Position(endLine, endChar);
    }
}

export enum DiagnosticSeverity {
    Error = 0,
    Warning = 1,
    Information = 2,
    Hint = 3,
}

export class Diagnostic {
    public source?: string;
    public code?: string | number | { value: string | number; target: Uri };
    public tags?: number[];
    public relatedInformation?: unknown[];

    constructor(
        public readonly range: Range,
        public message: string,
        public readonly severity: DiagnosticSeverity,
    ) {}
}

export class Uri {
    private constructor(
        public readonly scheme: string,
        public readonly path: string,
        public readonly fsPath: string,
        private readonly _raw: string,
    ) {}

    toString(): string {
        return this._raw;
    }

    static parse(value: string, _strict?: boolean): Uri {
        const scheme = value.split(':')[0] ?? 'unknown';
        return new Uri(scheme, value, value, value);
    }

    static file(fsPath: string): Uri {
        return new Uri('file', fsPath, fsPath, `file://${fsPath}`);
    }
}

// ---------------------------------------------------------------------------
// workspace — configurable per-test via __setConfig
// ---------------------------------------------------------------------------

let _configData: Record<string, unknown> = {};

export const __setConfig = (data: Record<string, unknown>): void => {
    _configData = data;
};

export const __resetConfig = (): void => {
    _configData = {};
};

export const workspace = {
    getConfiguration: (_section?: string, _scope?: unknown) => ({
        get: <T>(key: string, defaultValue?: T): T => {
            return (key in _configData ? _configData[key] : defaultValue) as T;
        },
    }),
};

export const languages = {
    createDiagnosticCollection: () => ({
        set: () => {},
        delete: () => {},
        clear: () => {},
        dispose: () => {},
    }),
};

export const ConfigurationTarget = { Workspace: 2 };
