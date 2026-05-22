#!/usr/bin/env node

import { Command } from 'commander';
import { getEnv, loadApiConfig } from './credentials.js';
import { findResearchOutliers, scoreManualFile } from './finder.js';
import { fetchClientAccessToken } from './oauth.js';
import { printResults } from './output.js';
import { TikTokResearchClient } from './tiktok.js';

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

program
    .name('tiktokbot')
    .description('TikTok breakout finder CLI for low-follower, high-view inspiration research')
    .version('0.1.0');

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
            envFiles: [
                'tiktokbot/.env',
                '~/.config/tiktokbot/.env',
                'TIKTOKBOT_ENV_FILE',
            ],
        }, null, 2));
    });

program.parse();
