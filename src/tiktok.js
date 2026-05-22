import { loadApiConfig } from './credentials.js';
import { fetchClientAccessToken } from './oauth.js';
import { toNumber } from './scoring.js';

const DEFAULT_VIDEO_FIELDS = [
    'id',
    'video_description',
    'create_time',
    'region_code',
    'share_count',
    'view_count',
    'like_count',
    'comment_count',
    'hashtag_names',
    'username',
    'video_duration',
];

const DEFAULT_USER_FIELDS = [
    'display_name',
    'bio_description',
    'avatar_url',
    'is_verified',
    'follower_count',
    'following_count',
    'likes_count',
    'video_count',
];

export class TikTokResearchClient {
    constructor(config = {}) {
        this.config = { ...loadApiConfig(), ...config };
        this.accessToken = this.config.accessToken;
        this.baseUrl = this.config.baseUrl || 'https://open.tiktokapis.com';
    }

    async getAccessToken() {
        if (this.accessToken) return this.accessToken;
        const token = await fetchClientAccessToken(this.config);
        this.accessToken = token.access_token;
        return this.accessToken;
    }

    async request(path, { method = 'GET', query = {}, body } = {}) {
        const token = await this.getAccessToken();
        const url = new URL(path, this.baseUrl);
        for (const [key, value] of Object.entries(query)) {
            if (value === undefined || value === null || value === '') continue;
            url.searchParams.set(key, String(value));
        }

        const response = await fetch(url, {
            method,
            headers: {
                Authorization: `Bearer ${token}`,
                ...(body ? { 'Content-Type': 'application/json' } : {}),
            },
            body: body ? JSON.stringify(body) : undefined,
        });
        const json = await response.json().catch(() => ({}));
        if (!response.ok) {
            const message = json?.error?.message || json?.message || `${response.status} ${response.statusText}`;
            throw new Error(`TikTok API error for ${path}: ${message}`);
        }
        return json;
    }

    async queryVideos({
        query,
        field = 'keyword',
        startDate,
        endDate,
        regionCode,
        minViews,
        maxResults = 50,
        fields = DEFAULT_VIDEO_FIELDS,
    }) {
        const videos = [];
        let cursor = 0;
        let hasMore = true;

        while (videos.length < maxResults && hasMore) {
            const maxCount = Math.min(100, maxResults - videos.length);
            const page = await this.request('/v2/research/video/query/', {
                method: 'POST',
                query: { fields: fields.join(',') },
                body: {
                    query: {
                        and: buildConditions({ query, field, regionCode, minViews }),
                    },
                    start_date: startDate,
                    end_date: endDate,
                    max_count: maxCount,
                    cursor,
                },
            });

            const data = page?.data || {};
            videos.push(...(data.videos || []).map(mapResearchVideo));
            cursor = data.cursor ?? cursor;
            hasMore = Boolean(data.has_more);
            if (!hasMore) break;
        }

        return videos.slice(0, maxResults);
    }

    async queryUserInfo(username, { fields = DEFAULT_USER_FIELDS } = {}) {
        const page = await this.request('/v2/research/user/info/', {
            method: 'POST',
            query: { fields: fields.join(',') },
            body: { username },
        });
        return mapResearchUser(username, page?.data || {});
    }
}

function buildConditions({ query, field, regionCode, minViews }) {
    const conditions = [];
    if (query) {
        conditions.push({
            operation: 'EQ',
            field_name: field,
            field_values: [field === 'hashtag_name' ? String(query).replace(/^#/, '') : String(query)],
        });
    }
    if (regionCode) {
        conditions.push({
            operation: 'EQ',
            field_name: 'region_code',
            field_values: [String(regionCode).toUpperCase()],
        });
    }
    if (minViews !== undefined) {
        conditions.push({
            operation: 'GTE',
            field_name: 'view_count',
            field_values: [String(minViews)],
        });
    }
    return conditions;
}

function isoFromCreateTime(createTime) {
    const seconds = toNumber(createTime, null);
    if (!seconds) return '';
    return new Date(seconds * 1000).toISOString();
}

function mapResearchVideo(item) {
    const creator = item.username || '';
    const id = item.id || '';
    return {
        platform: 'tiktok',
        id,
        url: creator && id ? `https://www.tiktok.com/@${creator}/video/${id}` : '',
        creator,
        caption: item.video_description || '',
        views: toNumber(item.view_count),
        likes: toNumber(item.like_count),
        comments: toNumber(item.comment_count),
        shares: toNumber(item.share_count),
        postedAt: isoFromCreateTime(item.create_time),
        durationSeconds: toNumber(item.video_duration, null),
        hashtags: item.hashtag_names || [],
        regionCode: item.region_code || '',
        source: 'tiktok_research_api',
    };
}

function mapResearchUser(username, data) {
    return {
        username,
        displayName: data.display_name || '',
        followers: toNumber(data.follower_count),
        following: toNumber(data.following_count),
        likes: toNumber(data.likes_count),
        videoCount: toNumber(data.video_count),
        isVerified: Boolean(data.is_verified),
        bio: data.bio_description || '',
        avatarUrl: data.avatar_url || '',
    };
}
