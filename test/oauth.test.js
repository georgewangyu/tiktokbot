import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAuthorizationUrl, createPkcePair, parseOAuthCallbackInput } from '../src/oauth.js';

test('buildAuthorizationUrl creates TikTok Login Kit URL', () => {
    const result = buildAuthorizationUrl({
        clientKey: 'client_123',
        redirectUri: 'https://example.com/tiktok/callback',
        scopes: ['user.info.basic', 'video.list'],
        state: 'state_123',
    });

    const url = new URL(result.url);
    assert.equal(url.origin + url.pathname, 'https://www.tiktok.com/v2/auth/authorize/');
    assert.equal(url.searchParams.get('client_key'), 'client_123');
    assert.equal(url.searchParams.get('response_type'), 'code');
    assert.equal(url.searchParams.get('scope'), 'user.info.basic,video.list');
    assert.equal(url.searchParams.get('redirect_uri'), 'https://example.com/tiktok/callback');
    assert.equal(url.searchParams.get('state'), 'state_123');
});

test('buildAuthorizationUrl includes PKCE parameters when provided', () => {
    const result = buildAuthorizationUrl({
        clientKey: 'client_123',
        redirectUri: 'http://127.0.0.1:3455/callback/',
        scopes: ['user.info.basic'],
        state: 'state_123',
        codeChallenge: 'challenge_123',
    });

    const url = new URL(result.url);
    assert.equal(url.searchParams.get('code_challenge'), 'challenge_123');
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
});

test('createPkcePair creates a verifier and TikTok desktop hex SHA256 challenge', () => {
    const pkce = createPkcePair();

    assert.match(pkce.verifier, /^[A-Za-z0-9_-]{43,128}$/);
    assert.match(pkce.challenge, /^[a-f0-9]{64}$/);
});

test('parseOAuthCallbackInput extracts code and state from callback URL', () => {
    const parsed = parseOAuthCallbackInput('https://example.com/tiktok/callback?code=abc123&state=state_123');

    assert.equal(parsed.code, 'abc123');
    assert.equal(parsed.state, 'state_123');
});

test('parseOAuthCallbackInput accepts a raw authorization code', () => {
    const parsed = parseOAuthCallbackInput('abc123');

    assert.equal(parsed.code, 'abc123');
    assert.equal(parsed.state, '');
});
