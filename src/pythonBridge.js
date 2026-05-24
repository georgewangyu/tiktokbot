import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { resolve } from 'path';
import { getEnv, loadWebConfig } from './credentials.js';

const BRIDGE_PATH = fileURLToPath(new URL('../python/tiktok_api_bridge.py', import.meta.url));

export async function collectWithPythonBridge({ command, query = '', maxResults = 30, msToken, browser, headless } = {}) {
    const config = loadWebConfig({ msToken, browser, headless });
    const python = config.pythonBin || getEnv('TIKTOK_PYTHON_BIN') || 'python3';
    const args = [
        BRIDGE_PATH,
        command,
        '--max-results',
        String(maxResults),
        '--browser',
        config.browser || 'chromium',
        '--headless',
        String(config.headless !== undefined ? config.headless : true),
    ];
    if (query) args.push('--query', query);

    const { stdout, stderr } = await runProcess(python, args, {
        ...process.env,
        TIKTOK_MS_TOKEN: config.msToken || process.env.TIKTOK_MS_TOKEN || '',
    });

    try {
        return JSON.parse(stdout || '[]');
    } catch (error) {
        throw new Error(`Python TikTok bridge returned non-JSON: ${error.message}${stderr ? `\n${stderr}` : ''}`);
    }
}

function runProcess(command, args, env) {
    return new Promise((resolvePromise, reject) => {
        const child = spawn(command, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', (chunk) => {
            stdout += chunk;
        });
        child.stderr.on('data', (chunk) => {
            stderr += chunk;
        });
        child.on('error', (error) => {
            reject(new Error(`Failed to run Python TikTok bridge with ${command}: ${error.message}`));
        });
        child.on('close', (code) => {
            if (code === 0) {
                resolvePromise({ stdout, stderr });
                return;
            }
            reject(new Error(`Python TikTok bridge failed with exit code ${code}${stderr ? `\n${stderr.trim()}` : ''}`));
        });
    });
}
