import { loadApiConfig } from './credentials.js';

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
