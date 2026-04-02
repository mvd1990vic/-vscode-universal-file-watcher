import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    resolve: {
        alias: {
            vscode: path.resolve(__dirname, '__mocks__/vscode.ts'),
        },
        // Allow .js imports to resolve to .ts files (Node16 module resolution)
        extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
    },
    test: {
        environment: 'node',
        include: ['src/test/**/*.test.ts'],
    },
});
