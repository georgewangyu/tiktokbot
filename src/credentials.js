import { existsSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

function loadEnvFile(filePath) {
    if (!filePath) return {};
    if (!existsSync(filePath)) return {};

    const loaded = {};
    for (const rawLine of readFileSync(filePath, 'utf8').split('\n')) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#') || !line.includes('=')) continue;

        const [key, ...rest] = line.split('=');
        let value = rest.join('=').trim();
        if (value.length >= 2 && value[0] === value.at(-1) && (value[0] === '"' || value[0] === "'")) {
            value = value.slice(1, -1);
        }
        loaded[key.trim()] = value;
    }
    return loaded;
}

let fileVars = null;

function getFileVars() {
    if (fileVars) return fileVars;

    const dir = fileURLToPath(new URL('.', import.meta.url));
    const localEnv = resolve(dir, '..', '.env');
    const configEnv = resolve(homedir(), '.config/tiktokbot/.env');
    const overrideEnv = process.env.TIKTOKBOT_ENV_FILE;

    fileVars = {
        ...loadEnvFile(configEnv),
        ...loadEnvFile(overrideEnv),
        ...loadEnvFile(localEnv),
    };
    return fileVars;
}

export function getDefaultEnvFilePath() {
    const dir = fileURLToPath(new URL('.', import.meta.url));
    return resolve(dir, '..', '.env');
}

export function getEnv(key) {
    return process.env[key] || getFileVars()[key] || '';
}

export function loadApiConfig(overrides = {}) {
    return {
        clientKey: overrides.clientKey || getEnv('TIKTOK_CLIENT_KEY'),
        clientSecret: overrides.clientSecret || getEnv('TIKTOK_CLIENT_SECRET'),
        accessToken: overrides.accessToken || getEnv('TIKTOK_RESEARCH_ACCESS_TOKEN') || getEnv('TIKTOK_ACCESS_TOKEN'),
        baseUrl: overrides.baseUrl || getEnv('TIKTOK_OPEN_API_BASE_URL') || 'https://open.tiktokapis.com',
    };
}

export function loadOAuthConfig(overrides = {}) {
    return {
        clientKey: overrides.clientKey || getEnv('TIKTOK_CLIENT_KEY'),
        clientSecret: overrides.clientSecret || getEnv('TIKTOK_CLIENT_SECRET'),
        redirectUri: overrides.redirectUri || getEnv('TIKTOK_REDIRECT_URI') || 'https://localhost/tiktok/callback',
        baseUrl: overrides.baseUrl || getEnv('TIKTOK_OPEN_API_BASE_URL') || 'https://open.tiktokapis.com',
    };
}

export function loadUserTokens() {
    return {
        accessToken: getEnv('TIKTOK_USER_ACCESS_TOKEN') || getEnv('TIKTOK_ACCESS_TOKEN'),
        refreshToken: getEnv('TIKTOK_USER_REFRESH_TOKEN') || getEnv('TIKTOK_REFRESH_TOKEN'),
        scope: getEnv('TIKTOK_USER_SCOPE'),
    };
}

export function loadWebConfig(overrides = {}) {
    return {
        msToken: overrides.msToken || getEnv('TIKTOK_MS_TOKEN') || getEnv('ms_token'),
        browser: overrides.browser || getEnv('TIKTOK_WEB_BROWSER') || 'chromium',
        headless: overrides.headless,
    };
}

export function requireEnv(keys) {
    const missing = keys.filter((key) => !getEnv(key));
    if (missing.length) {
        throw new Error(`Missing credentials: ${missing.join(', ')}`);
    }
}

export function writeEnvValues(filePath, values) {
    const target = filePath || getDefaultEnvFilePath();
    const existing = existsSync(target) ? readFileSync(target, 'utf8') : '';
    const lines = existing ? existing.split('\n') : [];
    const pending = new Map(Object.entries(values).filter(([, value]) => value !== undefined && value !== null && value !== ''));
    const output = lines.map((line) => {
        const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
        if (!match || !pending.has(match[1])) return line;
        const key = match[1];
        const value = pending.get(key);
        pending.delete(key);
        return `${key}=${escapeEnvValue(value)}`;
    });

    if (output.length && output.at(-1) !== '') output.push('');
    for (const [key, value] of pending) {
        output.push(`${key}=${escapeEnvValue(value)}`);
    }

    writeFileSync(target, output.join('\n').replace(/\n*$/, '\n'));
    fileVars = null;
    return target;
}

function escapeEnvValue(value) {
    const text = String(value);
    if (!text || /[\s"'#]/.test(text)) {
        return JSON.stringify(text);
    }
    return text;
}
