import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import test from 'node:test';
import { loadWebConfig, writeEnvValues } from '../src/credentials.js';

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

test('loadWebConfig mutes browser audio by default and honors overrides', () => {
    const previous = process.env.TIKTOK_WEB_MUTE_AUDIO;
    try {
        delete process.env.TIKTOK_WEB_MUTE_AUDIO;
        assert.equal(loadWebConfig().muteAudio, true);

        process.env.TIKTOK_WEB_MUTE_AUDIO = 'false';
        assert.equal(loadWebConfig().muteAudio, false);

        assert.equal(loadWebConfig({ muteAudio: true }).muteAudio, true);
    } finally {
        if (previous === undefined) {
            delete process.env.TIKTOK_WEB_MUTE_AUDIO;
        } else {
            process.env.TIKTOK_WEB_MUTE_AUDIO = previous;
        }
    }
});
