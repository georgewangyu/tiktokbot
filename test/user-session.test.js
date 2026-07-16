import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import test from 'node:test';
import {
    isUserAccessTokenError,
    isUserAccessTokenExpiring,
    saveUserTokenEnv,
    withUserAccessToken,
} from '../src/userSession.js';

test('withUserAccessToken refreshes, saves, and retries one invalid-token response', async () => {
    const attempts = [];
    const saved = [];
    const invalid = new Error('access token is invalid');
    invalid.status = 401;
    invalid.payload = { error: { code: 'access_token_invalid' } };

    const result = await withUserAccessToken(async (accessToken) => {
        attempts.push(accessToken);
        if (accessToken === 'old_access') throw invalid;
        return 'profile';
    }, {
        tokens: {
            accessToken: 'old_access',
            refreshToken: 'refresh_1',
        },
        refresh: async ({ refreshToken }) => {
            assert.equal(refreshToken, 'refresh_1');
            return {
                access_token: 'new_access',
                refresh_token: 'refresh_2',
            };
        },
        save: async (token) => saved.push(token),
    });

    assert.equal(result, 'profile');
    assert.deepEqual(attempts, ['old_access', 'new_access']);
    assert.equal(saved[0].refresh_token, 'refresh_2');
});

test('withUserAccessToken refreshes proactively when saved expiry is near', async () => {
    const now = Date.parse('2026-07-15T12:00:00.000Z');
    const attempts = [];

    const result = await withUserAccessToken(async (accessToken) => {
        attempts.push(accessToken);
        return 'videos';
    }, {
        tokens: {
            accessToken: 'old_access',
            refreshToken: 'refresh_1',
            accessTokenExpiresAt: '2026-07-15T12:00:30.000Z',
        },
        now,
        refresh: async () => ({
            access_token: 'new_access',
            refresh_token: 'refresh_2',
        }),
        save: async () => {},
    });

    assert.equal(result, 'videos');
    assert.deepEqual(attempts, ['new_access']);
});

test('withUserAccessToken does not hide non-authentication errors', async () => {
    let refreshCalls = 0;
    await assert.rejects(() => withUserAccessToken(async () => {
        throw new Error('TikTok rate limit');
    }, {
        tokens: { accessToken: 'access', refreshToken: 'refresh' },
        refresh: async () => {
            refreshCalls += 1;
            return { access_token: 'new_access' };
        },
    }), /rate limit/);
    assert.equal(refreshCalls, 0);
});

test('saveUserTokenEnv records token lifecycle metadata alongside tokens', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tiktokbot-session-'));
    const envFile = join(dir, '.env');
    const now = Date.parse('2026-07-15T12:00:00.000Z');
    try {
        saveUserTokenEnv({
            access_token: 'access_1',
            refresh_token: 'refresh_1',
            scope: 'user.info.basic,video.list',
            expires_in: 86400,
            refresh_expires_in: 31536000,
        }, envFile, { now });

        const saved = readFileSync(envFile, 'utf8');
        assert.match(saved, /TIKTOK_USER_TOKEN_UPDATED_AT=2026-07-15T12:00:00.000Z/);
        assert.match(saved, /TIKTOK_USER_ACCESS_TOKEN_EXPIRES_AT=2026-07-16T12:00:00.000Z/);
        assert.match(saved, /TIKTOK_USER_REFRESH_TOKEN_EXPIRES_AT=2027-07-15T12:00:00.000Z/);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

test('token error and expiry helpers stay conservative', () => {
    assert.equal(isUserAccessTokenError({ status: 401 }), true);
    assert.equal(isUserAccessTokenError(new Error('network unavailable')), false);
    assert.equal(isUserAccessTokenExpiring({ accessTokenExpiresAt: 'invalid' }), false);
});
