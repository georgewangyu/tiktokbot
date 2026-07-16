import {
    getDefaultEnvFilePath,
    loadUserTokens,
    writeEnvValues,
} from './credentials.js';
import { refreshUserAccessToken } from './oauth.js';

const DEFAULT_REFRESH_SKEW_MS = 60_000;

export function isUserAccessTokenError(error) {
    const errorCode = error?.payload?.error?.code;
    return error?.status === 401
        || errorCode === 'access_token_invalid'
        || /access token is invalid|access_token.*expired/i.test(error?.message || '');
}

export function isUserAccessTokenExpiring(tokens, {
    now = Date.now(),
    refreshSkewMs = DEFAULT_REFRESH_SKEW_MS,
} = {}) {
    if (!tokens?.accessTokenExpiresAt) return false;
    const expiresAt = Date.parse(tokens.accessTokenExpiresAt);
    if (!Number.isFinite(expiresAt)) return false;
    return expiresAt <= now + refreshSkewMs;
}

export function saveUserTokenEnv(token, envFile = getDefaultEnvFilePath(), { now = Date.now() } = {}) {
    const accessTokenExpiresAt = expiryIso(now, token.expires_in);
    const refreshTokenExpiresAt = expiryIso(now, token.refresh_expires_in);
    return writeEnvValues(envFile, {
        TIKTOK_USER_ACCESS_TOKEN: token.access_token,
        TIKTOK_USER_REFRESH_TOKEN: token.refresh_token,
        TIKTOK_USER_SCOPE: token.scope,
        TIKTOK_USER_TOKEN_UPDATED_AT: new Date(now).toISOString(),
        TIKTOK_USER_ACCESS_TOKEN_EXPIRES_AT: accessTokenExpiresAt,
        TIKTOK_USER_REFRESH_TOKEN_EXPIRES_AT: refreshTokenExpiresAt,
    });
}

export async function withUserAccessToken(operation, {
    tokens = loadUserTokens(),
    refresh = refreshUserAccessToken,
    save = saveUserTokenEnv,
    now = Date.now(),
    refreshSkewMs = DEFAULT_REFRESH_SKEW_MS,
} = {}) {
    if (!tokens.accessToken) {
        throw new Error('Missing credentials: TIKTOK_USER_ACCESS_TOKEN');
    }

    const run = (accessToken) => operation(accessToken);
    const canRefresh = Boolean(tokens.refreshToken);
    if (canRefresh && isUserAccessTokenExpiring(tokens, { now, refreshSkewMs })) {
        const refreshed = await refreshAndSave(tokens.refreshToken, refresh, save);
        return run(refreshed.access_token);
    }

    try {
        return await run(tokens.accessToken);
    } catch (error) {
        if (!canRefresh || !isUserAccessTokenError(error)) throw error;
        const refreshed = await refreshAndSave(tokens.refreshToken, refresh, save);
        return run(refreshed.access_token);
    }
}

async function refreshAndSave(refreshToken, refresh, save) {
    const refreshed = await refresh({ refreshToken });
    if (!refreshed?.access_token) {
        throw new Error('TikTok token refresh did not return an access token');
    }
    await save(refreshed);
    return refreshed;
}

function expiryIso(now, expiresInSeconds) {
    const seconds = Number(expiresInSeconds);
    if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
    return new Date(now + seconds * 1000).toISOString();
}
