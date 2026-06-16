import { createHash, randomBytes } from 'crypto';
import { loadApiConfig, loadOAuthConfig } from './credentials.js';

export const DEFAULT_DISPLAY_SCOPES = [
    'user.info.basic',
    'user.info.profile',
    'user.info.stats',
    'video.list',
];

export const CONTENT_POSTING_SCOPES = [
    'video.publish',
    'video.upload',
];

export function buildAuthorizationUrl({
    clientKey,
    redirectUri,
    scopes = DEFAULT_DISPLAY_SCOPES,
    state,
    disableAutoAuth,
    codeChallenge,
} = {}) {
    const oauth = loadOAuthConfig({ clientKey, redirectUri });
    if (!oauth.clientKey) throw new Error('Missing credentials: TIKTOK_CLIENT_KEY');

    const csrfState = state || randomBytes(18).toString('hex');
    const url = new URL('https://www.tiktok.com/v2/auth/authorize/');
    url.searchParams.set('client_key', oauth.clientKey);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', scopes.join(','));
    url.searchParams.set('redirect_uri', oauth.redirectUri);
    url.searchParams.set('state', csrfState);
    if (codeChallenge) {
        url.searchParams.set('code_challenge', codeChallenge);
        url.searchParams.set('code_challenge_method', 'S256');
    }
    if (disableAutoAuth !== undefined) {
        url.searchParams.set('disable_auto_auth', disableAutoAuth ? '1' : '0');
    }

    return { url: url.toString(), state: csrfState, scopes, redirectUri: oauth.redirectUri };
}

export function parseOAuthCallbackInput(input) {
    const value = String(input || '').trim();
    if (!value) return { code: '', state: '' };

    try {
        const parsed = new URL(value);
        return {
            code: parsed.searchParams.get('code') || '',
            state: parsed.searchParams.get('state') || '',
            error: parsed.searchParams.get('error') || '',
            errorDescription: parsed.searchParams.get('error_description') || '',
        };
    } catch {
        return { code: value, state: '' };
    }
}

export function createPkcePair() {
    const verifier = randomBytes(48).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('hex');
    return { verifier, challenge };
}

export async function fetchClientAccessToken(config = {}) {
    const api = { ...loadApiConfig(), ...config };
    if (!api.clientKey || !api.clientSecret) {
        throw new Error('Missing credentials: TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET');
    }

    const url = new URL('/v2/oauth/token/', api.baseUrl);
    const body = new URLSearchParams({
        client_key: api.clientKey,
        client_secret: api.clientSecret,
        grant_type: 'client_credentials',
    });

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
        const message = json?.error?.message || json?.message || `${response.status} ${response.statusText}`;
        throw new Error(`TikTok OAuth error: ${message}`);
    }
    return json;
}

export async function exchangeCodeForToken({ code, redirectUri, codeVerifier } = {}) {
    const oauth = loadOAuthConfig({ redirectUri });
    if (!oauth.clientKey || !oauth.clientSecret) {
        throw new Error('Missing credentials: TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET');
    }
    if (!code) throw new Error('Missing authorization code');

    const url = new URL('/v2/oauth/token/', oauth.baseUrl);
    const body = new URLSearchParams({
        client_key: oauth.clientKey,
        client_secret: oauth.clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: oauth.redirectUri,
    });
    if (codeVerifier) body.set('code_verifier', codeVerifier);

    return postTokenRequest(url, body);
}

export async function refreshUserAccessToken({ refreshToken } = {}) {
    const oauth = loadOAuthConfig();
    if (!oauth.clientKey || !oauth.clientSecret) {
        throw new Error('Missing credentials: TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET');
    }
    if (!refreshToken) throw new Error('Missing credentials: TIKTOK_USER_REFRESH_TOKEN');

    const url = new URL('/v2/oauth/token/', oauth.baseUrl);
    const body = new URLSearchParams({
        client_key: oauth.clientKey,
        client_secret: oauth.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
    });

    return postTokenRequest(url, body);
}

async function postTokenRequest(url, body) {
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Cache-Control': 'no-cache',
        },
        body,
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
        const message = json?.error_description || json?.error?.message || json?.message || `${response.status} ${response.statusText}`;
        throw new Error(`TikTok OAuth error: ${message}`);
    }
    return json;
}
