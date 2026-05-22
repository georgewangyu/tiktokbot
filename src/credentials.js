import { existsSync, readFileSync } from 'fs';
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

export function requireEnv(keys) {
    const missing = keys.filter((key) => !getEnv(key));
    if (missing.length) {
        throw new Error(`Missing credentials: ${missing.join(', ')}`);
    }
}
