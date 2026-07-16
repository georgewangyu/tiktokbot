import assert from 'node:assert/strict';
import test from 'node:test';
import { TikTokDisplayClient } from '../src/tiktok.js';

test('TikTokDisplayClient preserves status and payload for token recovery', async () => {
    const originalFetch = globalThis.fetch;
    try {
        globalThis.fetch = async () => new Response(JSON.stringify({
            error: {
                code: 'access_token_invalid',
                message: 'The access token is invalid or not found in the request.',
            },
        }), {
            status: 401,
            headers: { 'content-type': 'application/json' },
        });

        const client = new TikTokDisplayClient({
            accessToken: 'expired',
            baseUrl: 'https://open.test',
        });
        await assert.rejects(client.getMe(), (error) => {
            assert.equal(error.status, 401);
            assert.equal(error.payload.error.code, 'access_token_invalid');
            return true;
        });
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('TikTokDisplayClient rejects API errors returned with HTTP 200', async () => {
    const originalFetch = globalThis.fetch;
    try {
        globalThis.fetch = async () => new Response(JSON.stringify({
            error: {
                code: 'scope_not_authorized',
                message: 'Scope not authorized.',
            },
        }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        });

        const client = new TikTokDisplayClient({
            accessToken: 'valid',
            baseUrl: 'https://open.test',
        });
        await assert.rejects(client.getMe(), /Scope not authorized/);
    } finally {
        globalThis.fetch = originalFetch;
    }
});
