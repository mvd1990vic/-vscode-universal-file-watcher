import { describe, it, expect } from 'vitest';
import { matchesPattern } from '../extension.js';

describe('matchesPattern', () => {
    describe('glob patterns', () => {
        it('matches file by extension with matchBase', () => {
            expect(matchesPattern('/project/src/foo.ts', '*.ts')).toBe(true);
        });

        it('matches with ** glob', () => {
            expect(matchesPattern('/project/src/foo.ts', '**/*.ts')).toBe(true);
        });

        it('does not match different extension', () => {
            expect(matchesPattern('/project/src/foo.ts', '*.js')).toBe(false);
        });
    });

    describe('bare folder name (the reported bug)', () => {
        it('matches file directly inside folder', () => {
            expect(matchesPattern('/project/dist/foo.js', 'dist')).toBe(true);
        });

        it('matches file nested deeply inside folder', () => {
            expect(matchesPattern('/project/dist/sub/nested/foo.js', 'dist')).toBe(true);
        });

        it('matches node_modules', () => {
            expect(matchesPattern('/project/node_modules/lodash/index.js', 'node_modules')).toBe(true);
        });

        it('does not match file in a different folder', () => {
            expect(matchesPattern('/project/src/foo.js', 'dist')).toBe(false);
        });

        it('does not match file whose name contains the folder name', () => {
            expect(matchesPattern('/project/src/distribution.ts', 'dist')).toBe(false);
        });
    });

    describe('array of patterns', () => {
        it('matches if any pattern matches', () => {
            expect(matchesPattern('/project/dist/foo.js', ['src', 'dist'])).toBe(true);
        });

        it('returns false if no pattern matches', () => {
            expect(matchesPattern('/project/lib/foo.js', ['src', 'dist'])).toBe(false);
        });
    });
});
