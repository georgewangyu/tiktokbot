import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import test from 'node:test';
import { writeEnvValues } from '../src/credentials.js';

test('writeEnvValues updates existing keys and appends missing keys', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tiktokbot-env-'));
    const envFile = join(dir, '.env');
    writeFileSync(envFile, 'TIKTOK_CLIENT_KEY=client_123\nTIKTOK_USER_ACCESS_TOKEN=old\n');

    try {
        writeEnvValues(envFile, {
            TIKTOK_USER_ACCESS_TOKEN: 'new_access',
            TIKTOK_USER_REFRESH_TOKEN: 'new refresh',
        });

        assert.equal(
            readFileSync(envFile, 'utf8'),
            'TIKTOK_CLIENT_KEY=client_123\nTIKTOK_USER_ACCESS_TOKEN=new_access\n\nTIKTOK_USER_REFRESH_TOKEN="new refresh"\n',
        );
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});
