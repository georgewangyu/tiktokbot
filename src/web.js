import { chromium, firefox, webkit } from 'playwright';
import { loadWebConfig } from './credentials.js';
import { toNumber } from './scoring.js';

const BROWSERS = { chromium, firefox, webkit };
const TIKTOK_ORIGIN = 'https://www.tiktok.com';
const SEARCH_WEB_CODE = JSON.stringify({
    tiktok: {
        client_params_x: {
            search_engine: {
                ies_mt_user_live_video_card_use_libra: 1,
                mt_search_general_user_live_card: 1,
            },
        },
        search_server: {},
    },
});
const SIGNER_BOOTSTRAP_URLS = [
    'https://www.tiktok.com/foryou',
    'https://www.tiktok.com',
    'https://www.tiktok.com/@tiktok',
];

function randomInteger(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDeviceId() {
    return String(randomInteger(10 ** 18, 10 ** 19 - 1));
}

export class TikTokWebClient {
    constructor(config = {}) {
        this.config = { ...loadWebConfig(), ...config };
        this.browserName = this.config.browser || 'chromium';
        this.headless = this.config.headless !== undefined ? this.config.headless : true;
        this.muteAudio = this.config.muteAudio !== undefined ? this.config.muteAudio : true;
        this.msToken = this.config.msToken || '';
        this.browser = null;
        this.context = null;
        this.page = null;
        this.sessionParams = null;
        this.requestHeaders = null;
    }

    async start() {
        if (this.page) return;
        const browserType = BROWSERS[this.browserName];
        if (!browserType) throw new Error(`Unsupported browser: ${this.browserName}`);

        const launchOptions = { headless: this.headless };
        if (this.muteAudio && this.browserName === 'chromium') {
            launchOptions.args = ['--mute-audio'];
        }
        this.browser = await browserType.launch(launchOptions);
        this.context = await this.browser.newContext({
            locale: 'en-US',
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            viewport: { width: 1440, height: 900 },
        });
        if (this.muteAudio) {
            await this.context.addInitScript(() => {
                const muteMedia = (node) => {
                    if (node instanceof HTMLMediaElement) {
                        node.muted = true;
                        node.volume = 0;
                    }
                };
                for (const node of document.querySelectorAll('audio,video')) muteMedia(node);
                const root = document.documentElement || document;
                new MutationObserver((mutations) => {
                    for (const mutation of mutations) {
                        for (const node of mutation.addedNodes) {
                            muteMedia(node);
                            if (node instanceof Element) {
                                for (const media of node.querySelectorAll('audio,video')) muteMedia(media);
                            }
                        }
                    }
                }).observe(root, { childList: true, subtree: true });
            });
        }
        if (this.msToken) {
            await this.context.addCookies([{
                name: 'msToken',
                value: this.msToken,
                domain: '.tiktok.com',
                path: '/',
                httpOnly: false,
                secure: true,
                sameSite: 'None',
            }]);
        }
        this.page = await this.context.newPage();
        this.page.once('request', (request) => {
            this.requestHeaders = request.headers();
        });
        await this.page.goto(TIKTOK_ORIGIN, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await this.page.mouse.move(randomInteger(0, 50), randomInteger(0, 50));
        await this.page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
        await this.page.mouse.move(randomInteger(60, 180), randomInteger(100, 240));
        await this.page.waitForTimeout(1500);
        await this.refreshMsTokenFromCookies();
        this.sessionParams = await this.buildSessionParams();
    }

    async close() {
        await this.browser?.close();
        this.browser = null;
        this.context = null;
        this.page = null;
        this.sessionParams = null;
        this.requestHeaders = null;
    }

    async request(path, params = {}) {
        await this.start();
        await this.refreshMsTokenFromCookies();
        const url = await this.buildSignedUrl(path, params);
        const result = await this.page.evaluate(async (target) => {
            const response = await fetch(target, {
                credentials: 'include',
                headers: {
                    accept: 'application/json, text/plain, */*',
                    referer: 'https://www.tiktok.com/',
                },
            });
            const text = await response.text();
            return {
                ok: response.ok,
                status: response.status,
                statusText: response.statusText,
                text,
            };
        }, url.toString());

        if (!result.ok) {
            throw new Error(`TikTok web request failed for ${path}: ${result.status} ${result.statusText}`);
        }
        if (!result.text) {
            throw new Error(`TikTok returned an empty response for ${path}; try --headful, TIKTOK_MS_TOKEN, or a different network/session`);
        }
        try {
            return JSON.parse(result.text);
        } catch (error) {
            throw new Error(`TikTok returned non-JSON for ${path}: ${error.message}`);
        }
    }

    async refreshMsTokenFromCookies() {
        if (this.msToken) return this.msToken;
        const cookies = await this.context.cookies(TIKTOK_ORIGIN);
        this.msToken = cookies.find((cookie) => cookie.name === 'msToken')?.value || '';
        return this.msToken;
    }

    async buildSessionParams() {
        const data = await this.page.evaluate(() => ({
            userAgent: navigator.userAgent,
            language: navigator.language || navigator.userLanguage || 'en-US',
            platform: navigator.platform || 'MacIntel',
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles',
            screenHeight: window.screen?.height || 900,
            screenWidth: window.screen?.width || 1440,
        }));

        return {
            aid: '1988',
            app_language: data.language,
            app_name: 'tiktok_web',
            browser_language: data.language,
            browser_name: 'Mozilla',
            browser_online: 'true',
            browser_platform: data.platform,
            browser_version: data.userAgent,
            channel: 'tiktok_web',
            cookie_enabled: 'true',
            device_id: randomDeviceId(),
            device_platform: 'web_pc',
            focus_state: 'true',
            from_page: 'user',
            history_len: String(randomInteger(1, 10)),
            is_fullscreen: 'false',
            is_page_visible: 'true',
            language: data.language,
            os: data.platform,
            priority_region: '',
            referer: '',
            region: 'US',
            screen_height: String(data.screenHeight),
            screen_width: String(data.screenWidth),
            tz_name: data.timezone,
            webcast_language: data.language,
        };
    }

    async buildSignedUrl(path, params = {}) {
        const url = new URL(path, TIKTOK_ORIGIN);
        const merged = {
            ...this.sessionParams,
            ...params,
        };
        if (!merged.msToken) merged.msToken = this.msToken;
        for (const [key, value] of Object.entries(merged)) {
            if (value === undefined || value === null || value === '') continue;
            url.searchParams.set(key, String(value));
        }

        const signature = await this.generateXBogus(url.toString());
        if (signature?.['X-Bogus']) url.searchParams.set('X-Bogus', signature['X-Bogus']);
        return url.toString();
    }

    async generateXBogus(target) {
        for (let attempt = 0; attempt < 5; attempt += 1) {
            const hasSigner = await this.page.evaluate(() => Boolean(window.byted_acrawler?.frontierSign)).catch(() => false);
            if (hasSigner) {
                return this.page.evaluate((url) => window.byted_acrawler.frontierSign(url), target);
            }
            await this.page.goto(SIGNER_BOOTSTRAP_URLS[attempt % SIGNER_BOOTSTRAP_URLS.length], {
                waitUntil: 'domcontentloaded',
                timeout: 30000,
            }).catch(() => {});
            await this.page.waitForTimeout(1000 + attempt * 500);
        }
        throw new Error('TikTok signer did not load; try --headful, --browser webkit, TIKTOK_MS_TOKEN, or a different network/session');
    }

    async searchVideos({ query, maxResults = 30, cursor = 0 } = {}) {
        const videos = [];
        let nextCursor = cursor;
        let searchId = '';
        while (videos.length < maxResults) {
            const page = await this.request('/api/search/item/full/', {
                keyword: query,
                cursor: nextCursor,
                from_page: 'search',
                web_search_code: SEARCH_WEB_CODE,
                ...(searchId ? { search_id: searchId } : {}),
            });
            const items = page.item_list || page.itemList || [];
            videos.push(...items.map(mapWebVideo));
            if (!page.has_more && !page.hasMore) break;
            nextCursor = page.cursor ?? nextCursor;
            searchId = page.rid || searchId;
            if (!items.length) break;
        }
        return videos.slice(0, maxResults);
    }

    async trendingVideos({ maxResults = 30 } = {}) {
        const page = await this.request('/api/recommend/item_list/', {
            from_page: 'fyp',
            count: maxResults,
        });
        return (page.itemList || page.item_list || []).slice(0, maxResults).map(mapWebVideo);
    }
}

export async function withTikTokWebClient(config, fn) {
    const client = new TikTokWebClient(config);
    try {
        return await fn(client);
    } finally {
        await client.close();
    }
}

export function mapWebVideo(item) {
    const author = item.author || {};
    const authorStats = item.authorStats || item.authorStatsV2 || {};
    const stats = item.stats || item.statsV2 || {};
    const id = item.id || '';
    const creator = author.uniqueId || author.unique_id || '';
    const createTime = toNumber(item.createTime, null);
    const postedAt = createTime ? new Date(createTime * 1000).toISOString() : '';
    return {
        platform: 'tiktok',
        id,
        url: creator && id ? `https://www.tiktok.com/@${creator}/video/${id}` : '',
        creator,
        followers: toNumber(authorStats.followerCount ?? authorStats.follower_count),
        views: toNumber(stats.playCount ?? stats.play_count),
        likes: toNumber(stats.diggCount ?? stats.likeCount ?? stats.like_count),
        comments: toNumber(stats.commentCount ?? stats.comment_count),
        shares: toNumber(stats.shareCount ?? stats.share_count),
        caption: item.desc || '',
        postedAt,
        durationSeconds: toNumber(item.video?.duration, null),
        source: 'tiktok_web',
    };
}
