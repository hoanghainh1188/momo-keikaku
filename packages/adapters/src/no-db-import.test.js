import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
const HERE = dirname(fileURLToPath(import.meta.url));
describe('adapters never import @momo/db (AD-1 / story 5.1)', () => {
    it('has no @momo/db import in adapter sources', () => {
        const files = readdirSync(HERE).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
        for (const file of files) {
            const source = readFileSync(join(HERE, file), 'utf8');
            expect(source, file).not.toMatch(/from ['"]@momo\/db(?:\/[^'"]*)?['"]/);
            expect(source, file).not.toMatch(/import\(['"]@momo\/db(?:\/[^'"]*)?['"]\)/);
            expect(source, file).not.toMatch(/from ['"]\.\.\/db/);
        }
    });
});
