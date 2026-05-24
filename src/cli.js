#!/usr/bin/env node

import { Command } from 'commander';
import { stdin, stdout } from 'process';
import { createInterface } from 'readline/promises';
import { getDefaultEnvFilePath, getEnv, loadApiConfig, loadOAuthConfig, loadUserTokens, writeEnvValues } from './credentials.js';
import { findMyOutliers, findResearchOutliers, rankRows, scoreManualFile } from './finder.js';
import { buildAuthorizationUrl, createPkcePair, DEFAULT_DISPLAY_SCOPES, exchangeCodeForToken, fetchClientAccessToken, parseOAuthCallbackInput, refreshUserAccessToken } from './oauth.js';
import { printResults } from './output.js';
import { getDisplayUserFields, TikTokDisplayClient, TikTokResearchClient } from './tiktok.js';
import { withTikTokWebClient } from './web.js';

const program = new Command();

function parseInteger(value) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) throw new Error(`Invalid integer: ${value}`);
    return parsed;
}

function parseFloatOption(value) {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed)) throw new Error(`Invalid number: ${value}`);
    return parsed;
}

function parseBoolean(value) {
    if (value === true || value === false) return value;
    return !['0', 'false', 'no', 'off'].includes(String(value).toLowerCase());
}

program
    .name('tiktokbot')
    .description('TikTok breakout finder CLI for low-follower, high-view inspiration research')
    .version('0.1.0');

program
    .command('auth-url')
    .description('Generate a TikTok Login Kit OAuth URL for Display API access')
    .option('--redirect-uri <uri>', 'Override redirect URI')
    .option('--scope <scopes>', 'Comma- or space-separated scopes', DEFAULT_DISPLAY_SCOPES.join(','))
    .option('--state <value>', 'Explicit OAuth state value')
    .option('--disable-auto-auth', 'Always show the TikTok authorization page')
    .option('--pkce', 'Include a desktop-app PKCE challenge and print the verifier')
    .action((options) => {
        try {
            const scopes = options.scope.split(/[,\s]+/).map((scope) => scope.trim()).filter(Boolean);
            const pkce = options.pkce ? createPkcePair() : null;
            const result = buildAuthorizationUrl({
                redirectUri: options.redirectUri,
                scopes,
                state: options.state,
                disableAutoAuth: options.disableAutoAuth,
                codeChallenge: pkce?.challenge,
            });
            console.log(`State: ${result.state}`);
            console.log(`Scopes: ${result.scopes.join(',')}`);
            console.log(`Redirect URI: ${result.redirectUri}`);
            if (pkce) console.log(`Code verifier: ${pkce.verifier}`);
            console.log(result.url);
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    });

program
    .command('oauth-login')
    .description('Run the TikTok Display API OAuth setup flow and optionally save user tokens')
    .option('--redirect-uri <uri>', 'Override redirect URI')
    .option('--scope <scopes>', 'Comma- or space-separated scopes', DEFAULT_DISPLAY_SCOPES.join(','))
    .option('--state <value>', 'Explicit OAuth state value')
    .option('--disable-auto-auth', 'Always show the TikTok authorization page')
    .option('--env-file <path>', 'Env file to update when saving tokens', getDefaultEnvFilePath())
    .option('--no-save', 'Print tokens without updating the env file')
    .option('--no-pkce', 'Disable desktop-app PKCE parameters')
    .action(async (options) => {
        const rl = createInterface({ input: stdin, output: stdout });
        try {
            const scopes = options.scope.split(/[,\s]+/).map((scope) => scope.trim()).filter(Boolean);
            const pkce = options.pkce ? createPkcePair() : null;
            const auth = buildAuthorizationUrl({
                redirectUri: options.redirectUri,
                scopes,
                state: options.state,
                disableAutoAuth: options.disableAutoAuth,
                codeChallenge: pkce?.challenge,
            });

            console.log(`Redirect URI: ${auth.redirectUri}`);
            console.log(`Scopes: ${auth.scopes.join(',')}`);
            console.log(`State: ${auth.state}`);
            console.log('\nOpen this URL and authorize the TikTok account:\n');
            console.log(auth.url);
            const callbackInput = await rl.question('\nPaste the full callback URL or code: ');
            const callback = parseOAuthCallbackInput(callbackInput);
            if (callback.error) {
                throw new Error(`TikTok OAuth callback error: ${callback.errorDescription || callback.error}`);
            }
            if (!callback.code) throw new Error('No authorization code found in callback input');
            if (callback.state && callback.state !== auth.state) {
                throw new Error(`OAuth state mismatch. Expected ${auth.state}, got ${callback.state}`);
            }

            const token = await exchangeCodeForToken({
                code: callback.code,
                redirectUri: options.redirectUri,
                codeVerifier: pkce?.verifier,
            });
            printTokenSummary(token, { envFile: options.save ? options.envFile : '' });
            if (options.save) {
                const target = saveUserTokenEnv(token, options.envFile);
                console.log(`\nSaved Display API tokens to ${target}`);
            }
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exitCode = 1;
        } finally {
            rl.close();
        }
    });

program
    .command('exchange-code <code>')
    .description('Exchange a TikTok OAuth authorization code for user tokens')
    .option('--redirect-uri <uri>', 'Override redirect URI')
    .option('--code-verifier <value>', 'PKCE code verifier for desktop/mobile app flows')
    .option('--save', 'Save returned user tokens to an env file')
    .option('--env-file <path>', 'Env file to update when saving tokens', getDefaultEnvFilePath())
    .action(async (code, options) => {
        try {
            const callback = parseOAuthCallbackInput(code);
            if (callback.error) {
                throw new Error(`TikTok OAuth callback error: ${callback.errorDescription || callback.error}`);
            }
            const token = await exchangeCodeForToken({
                code: callback.code,
                redirectUri: options.redirectUri,
                codeVerifier: options.codeVerifier,
            });
            printTokenSummary(token, { envFile: options.save ? options.envFile : '' });
            if (options.save) {
                const target = saveUserTokenEnv(token, options.envFile);
                console.log(`\nSaved Display API tokens to ${target}`);
            }
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    });

program
    .command('refresh-token')
    .description('Refresh the TikTok user access token using TIKTOK_USER_REFRESH_TOKEN')
    .option('--save', 'Save returned user tokens to an env file')
    .option('--env-file <path>', 'Env file to update when saving tokens', getDefaultEnvFilePath())
    .action(async (options) => {
        try {
            const tokens = loadUserTokens();
            const token = await refreshUserAccessToken({ refreshToken: tokens.refreshToken });
            printTokenSummary(token, { envFile: options.save ? options.envFile : '' });
            if (options.save) {
                const target = saveUserTokenEnv(token, options.envFile);
                console.log(`\nSaved Display API tokens to ${target}`);
            }
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    });

program
    .command('client-token')
    .description('Fetch a TikTok client access token using TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET')
    .action(async () => {
        try {
            const token = await fetchClientAccessToken();
            console.log(JSON.stringify({
                token_type: token.token_type,
                expires_in: token.expires_in,
                has_access_token: Boolean(token.access_token),
            }, null, 2));
            if (token.access_token) {
                console.log('\nSuggested env addition:');
                console.log(`TIKTOK_RESEARCH_ACCESS_TOKEN=${token.access_token}`);
            }
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    });

program
    .command('user <username>')
    .description('Fetch TikTok Research API user info for one username')
    .action(async (username) => {
        try {
            const client = new TikTokResearchClient();
            const user = await client.queryUserInfo(username.replace(/^@/, ''));
            console.log(JSON.stringify(user, null, 2));
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    });

program
    .command('me')
    .description('Fetch the OAuth-authorized TikTok account through Display API')
    .option('--scope <scopes>', 'Scopes to use when choosing Display API fields; defaults to TIKTOK_USER_SCOPE')
    .action(async (options) => {
        try {
            const tokens = loadUserTokens();
            const client = new TikTokDisplayClient({ accessToken: tokens.accessToken });
            const me = await client.getMe({ fields: getDisplayUserFields(options.scope || tokens.scope) });
            console.log(JSON.stringify(me, null, 2));
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    });

program
    .command('my-videos')
    .description('Fetch recent videos for the OAuth-authorized TikTok account through Display API')
    .option('--max-results <number>', 'Maximum videos to fetch', parseInteger, 60)
    .option('--format <format>', 'Output format: table, json, jsonl', 'json')
    .action(async (options) => {
        try {
            const tokens = loadUserTokens();
            const client = new TikTokDisplayClient({ accessToken: tokens.accessToken });
            const videos = await client.listVideos({ maxResults: options.maxResults });
            printResults(videos.map((video) => ({
                ...video,
                followers: null,
                score: null,
                viewsPerFollower: null,
            })), options.format);
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    });

program
    .command('my-outliers')
    .description('Rank recent videos for the OAuth-authorized TikTok account against its own baseline')
    .option('--max-results <number>', 'Maximum videos to fetch', parseInteger, 60)
    .option('--baseline-videos <number>', 'Recent videos to use for baseline', parseInteger, 12)
    .option('--min-baseline-videos <number>', 'Minimum baseline videos needed for per-video baseline', parseInteger, 3)
    .option('--min-views <number>', 'Minimum target video views', parseInteger)
    .option('--min-outlier <number>', 'Minimum creator-baseline multiplier', parseFloatOption)
    .option('--limit <number>', 'Maximum rows to print', parseInteger, 20)
    .option('--sort <sort>', 'Sort: score, outlier, views-per-follower, views, velocity, date, followers', 'outlier')
    .option('--format <format>', 'Output format: table, json, jsonl', 'table')
    .action(async (options) => {
        try {
            const tokens = loadUserTokens();
            const results = await findMyOutliers({
                accessToken: tokens.accessToken,
                maxResults: options.maxResults,
                baselineVideos: options.baselineVideos,
                minBaselineVideos: options.minBaselineVideos,
                minViews: options.minViews,
                minOutlierScore: options.minOutlier,
                limit: options.limit,
                sort: options.sort,
            });
            printResults(results, options.format);
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    });

program
    .command('check')
    .description('Show the authorized account follower count and recent videos above an outlier threshold')
    .option('--max-results <number>', 'Maximum recent videos to fetch', parseInteger, 60)
    .option('--baseline-videos <number>', 'Recent videos to use for baseline', parseInteger, 12)
    .option('--min-baseline-videos <number>', 'Minimum baseline videos needed for per-video baseline', parseInteger, 3)
    .option('--min-views <number>', 'Minimum target video views', parseInteger)
    .option('--min-outlier <number>', 'Minimum creator-baseline multiplier', parseFloatOption, 2)
    .option('--limit <number>', 'Maximum rows to print', parseInteger, 10)
    .option('--format <format>', 'Output format: table or json', 'table')
    .action(async (options) => {
        try {
            const tokens = loadUserTokens();
            const client = new TikTokDisplayClient({ accessToken: tokens.accessToken });
            const [me, results] = await Promise.all([
                client.getMe({ fields: getDisplayUserFields(tokens.scope) }),
                findMyOutliers({
                    client,
                    maxResults: options.maxResults,
                    baselineVideos: options.baselineVideos,
                    minBaselineVideos: options.minBaselineVideos,
                    minViews: options.minViews,
                    minOutlierScore: options.minOutlier,
                    limit: options.limit,
                    sort: 'outlier',
                }),
            ]);

            if (options.format === 'json') {
                console.log(JSON.stringify({ account: me, outliers: results }, null, 2));
                return;
            }

            const handle = me.username || me.displayName ? `@${me.username || me.displayName}` : 'authorized account';
            console.log(`${handle}: ${me.followers?.toLocaleString?.() ?? '-'} followers, ${me.videoCount?.toLocaleString?.() ?? '-'} videos, ${me.likes?.toLocaleString?.() ?? '-'} likes`);
            console.log(`Recent videos above ${options.minOutlier}x creator baseline:`);
            printResults(results, 'table');
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    });

program
    .command('find <query>')
    .description('Find TikTok videos that overperform creator size using the Research API')
    .option('--field <field>', 'Research API field: keyword or hashtag_name', 'keyword')
    .option('--region <code>', 'TikTok region_code filter, for example US')
    .option('--days <number>', 'Search window in recent days; Research API windows should stay <= 30', parseInteger, 30)
    .option('--start-date <yyyymmdd>', 'Explicit Research API start_date')
    .option('--end-date <yyyymmdd>', 'Explicit Research API end_date')
    .option('--max-results <number>', 'Maximum TikTok videos to inspect', parseInteger, 50)
    .option('--limit <number>', 'Maximum rows to print', parseInteger, 20)
    .option('--max-followers <number>', 'Maximum creator followers', parseInteger)
    .option('--min-views <number>', 'Minimum target video views', parseInteger)
    .option('--min-views-per-follower <number>', 'Minimum views/followers ratio', parseFloatOption)
    .option('--sort <sort>', 'Sort: score, outlier, views-per-follower, views, velocity, date, followers', 'score')
    .option('--format <format>', 'Output format: table, json, jsonl', 'table')
    .action(async (query, options) => {
        try {
            if (!options.startDate && Number(options.days) > 30) {
                throw new Error('TikTok Research API queries should use windows of 30 days or less. Use repeated runs for longer periods.');
            }
            const results = await findResearchOutliers({
                query,
                field: options.field,
                regionCode: options.region,
                days: options.days,
                startDate: options.startDate,
                endDate: options.endDate,
                maxResults: options.maxResults,
                limit: options.limit,
                maxFollowers: options.maxFollowers,
                minViews: options.minViews,
                minViewsPerFollower: options.minViewsPerFollower,
                sort: options.sort,
            });
            printResults(results, options.format);
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    });

program
    .command('web-search <query>')
    .description('Experimentally search public TikTok web results using Playwright session scraping')
    .option('--max-results <number>', 'Maximum TikTok videos to inspect', parseInteger, 30)
    .option('--limit <number>', 'Maximum rows to print', parseInteger, 20)
    .option('--max-followers <number>', 'Maximum creator followers', parseInteger)
    .option('--min-views <number>', 'Minimum target video views', parseInteger)
    .option('--min-views-per-follower <number>', 'Minimum views/followers ratio', parseFloatOption)
    .option('--sort <sort>', 'Sort: score, outlier, views-per-follower, views, velocity, date, followers', 'views-per-follower')
    .option('--format <format>', 'Output format: table, json, jsonl', 'table')
    .option('--ms-token <value>', 'TikTok msToken cookie value; defaults to TIKTOK_MS_TOKEN or ms_token env')
    .option('--browser <browser>', 'Playwright browser: chromium, firefox, webkit', 'chromium')
    .option('--headless <bool>', 'Run browser headless; use false if TikTok blocks the session', parseBoolean, true)
    .action(async (query, options) => {
        try {
            const videos = await withTikTokWebClient({
                msToken: options.msToken,
                browser: options.browser,
                headless: options.headless,
            }, (client) => client.searchVideos({
                query,
                maxResults: options.maxResults,
            }));
            const results = rankRows(videos, {
                maxFollowers: options.maxFollowers,
                minViews: options.minViews,
                minViewsPerFollower: options.minViewsPerFollower,
                limit: options.limit,
                sort: options.sort,
            });
            printResults(results, options.format);
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    });

program
    .command('web-trending')
    .description('Experimentally fetch public TikTok trending/FYP videos using Playwright session scraping')
    .option('--max-results <number>', 'Maximum TikTok videos to inspect', parseInteger, 30)
    .option('--limit <number>', 'Maximum rows to print', parseInteger, 20)
    .option('--max-followers <number>', 'Maximum creator followers', parseInteger)
    .option('--min-views <number>', 'Minimum target video views', parseInteger)
    .option('--min-views-per-follower <number>', 'Minimum views/followers ratio', parseFloatOption)
    .option('--sort <sort>', 'Sort: score, outlier, views-per-follower, views, velocity, date, followers', 'views-per-follower')
    .option('--format <format>', 'Output format: table, json, jsonl', 'table')
    .option('--ms-token <value>', 'TikTok msToken cookie value; defaults to TIKTOK_MS_TOKEN or ms_token env')
    .option('--browser <browser>', 'Playwright browser: chromium, firefox, webkit', 'chromium')
    .option('--headless <bool>', 'Run browser headless; use false if TikTok blocks the session', parseBoolean, true)
    .action(async (options) => {
        try {
            const videos = await withTikTokWebClient({
                msToken: options.msToken,
                browser: options.browser,
                headless: options.headless,
            }, (client) => client.trendingVideos({
                maxResults: options.maxResults,
            }));
            const results = rankRows(videos, {
                maxFollowers: options.maxFollowers,
                minViews: options.minViews,
                minViewsPerFollower: options.minViewsPerFollower,
                limit: options.limit,
                sort: options.sort,
            });
            printResults(results, options.format);
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    });

program
    .command('score-file <path>')
    .description('Score a manually collected CSV, JSON, or JSONL worksheet')
    .option('--limit <number>', 'Maximum rows to print', parseInteger, 20)
    .option('--max-followers <number>', 'Maximum creator followers', parseInteger)
    .option('--min-views <number>', 'Minimum target video views', parseInteger)
    .option('--min-views-per-follower <number>', 'Minimum views/followers ratio', parseFloatOption)
    .option('--sort <sort>', 'Sort: score, outlier, views-per-follower, views, velocity, date, followers', 'score')
    .option('--format <format>', 'Output format: table, json, jsonl', 'table')
    .action((path, options) => {
        try {
            const results = scoreManualFile(path, {
                limit: options.limit,
                maxFollowers: options.maxFollowers,
                minViews: options.minViews,
                minViewsPerFollower: options.minViewsPerFollower,
                sort: options.sort,
            });
            printResults(results, options.format);
        } catch (error) {
            console.error(`Error: ${error.message}`);
            process.exit(1);
        }
    });

program
    .command('env')
    .description('Show resolved non-secret TikTok config state')
    .action(() => {
        const api = loadApiConfig();
        console.log(JSON.stringify({
            baseUrl: api.baseUrl,
            hasClientKey: Boolean(getEnv('TIKTOK_CLIENT_KEY')),
            hasClientSecret: Boolean(getEnv('TIKTOK_CLIENT_SECRET')),
            hasResearchAccessToken: Boolean(getEnv('TIKTOK_RESEARCH_ACCESS_TOKEN') || getEnv('TIKTOK_ACCESS_TOKEN')),
            hasUserAccessToken: Boolean(getEnv('TIKTOK_USER_ACCESS_TOKEN') || getEnv('TIKTOK_ACCESS_TOKEN')),
            hasUserRefreshToken: Boolean(getEnv('TIKTOK_USER_REFRESH_TOKEN') || getEnv('TIKTOK_REFRESH_TOKEN')),
            userScope: getEnv('TIKTOK_USER_SCOPE') || null,
            hasMsToken: Boolean(getEnv('TIKTOK_MS_TOKEN') || getEnv('ms_token')),
            redirectUri: loadOAuthConfig().redirectUri,
            envFiles: [
                'tiktokbot/.env',
                '~/.config/tiktokbot/.env',
                'TIKTOKBOT_ENV_FILE',
            ],
        }, null, 2));
    });

program.parse();

function printTokenSummary(token, { envFile = '' } = {}) {
    console.log(JSON.stringify({
        token_type: token.token_type,
        expires_in: token.expires_in,
        refresh_expires_in: token.refresh_expires_in,
        scope: token.scope,
        open_id: token.open_id,
        has_access_token: Boolean(token.access_token),
        has_refresh_token: Boolean(token.refresh_token),
    }, null, 2));
    console.log(envFile ? `\nEnv values for ${envFile}:` : '\nSuggested env additions:');
    if (token.access_token) console.log(`TIKTOK_USER_ACCESS_TOKEN=${token.access_token}`);
    if (token.refresh_token) console.log(`TIKTOK_USER_REFRESH_TOKEN=${token.refresh_token}`);
}

function saveUserTokenEnv(token, envFile) {
    return writeEnvValues(envFile, {
        TIKTOK_USER_ACCESS_TOKEN: token.access_token,
        TIKTOK_USER_REFRESH_TOKEN: token.refresh_token,
        TIKTOK_USER_SCOPE: token.scope,
    });
}
