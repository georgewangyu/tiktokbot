import { loadApiConfig } from './credentials.js';
import { fetchClientAccessToken } from './oauth.js';
import { toNumber } from './scoring.js';
import { open, stat } from 'fs/promises';
import { extname, resolve } from 'path';

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
    'open_id',
    'union_id',
    'username',
    'display_name',
    'bio_description',
    'avatar_url',
    'profile_deep_link',
    'is_verified',
    'follower_count',
    'following_count',
    'likes_count',
    'video_count',
];

const BASIC_DISPLAY_USER_FIELDS = [
    'open_id',
    'union_id',
    'avatar_url',
    'display_name',
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

const DEFAULT_DISPLAY_VIDEO_FIELDS = [
    'id',
    'create_time',
    'share_url',
    'video_description',
    'duration',
    'title',
    'like_count',
    'comment_count',
    'share_count',
    'view_count',
];

export class TikTokDisplayClient {
    constructor({ accessToken, baseUrl } = {}) {
        this.accessToken = accessToken;
        this.baseUrl = baseUrl || loadApiConfig().baseUrl || 'https://open.tiktokapis.com';
        if (!this.accessToken) {
            throw new Error('Missing credentials: TIKTOK_USER_ACCESS_TOKEN');
        }
    }

    async request(path, { method = 'GET', query = {}, body } = {}) {
        const url = new URL(path, this.baseUrl);
        for (const [key, value] of Object.entries(query)) {
            if (value === undefined || value === null || value === '') continue;
            url.searchParams.set(key, String(value));
        }

        const response = await fetch(url, {
            method,
            headers: {
                Authorization: `Bearer ${this.accessToken}`,
                ...(body ? { 'Content-Type': 'application/json' } : {}),
            },
            body: body ? JSON.stringify(body) : undefined,
        });
        const json = await response.json().catch(() => ({}));
        if (!response.ok) {
            const message = json?.error?.message || json?.error_description || json?.message || `${response.status} ${response.statusText}`;
            throw new Error(`TikTok Display API error for ${path}: ${message}`);
        }
        return json;
    }

    async getMe({ fields = DEFAULT_USER_FIELDS } = {}) {
        const page = await this.request('/v2/user/info/', {
            query: { fields: fields.join(',') },
        });
        return mapDisplayUser(page?.data?.user || {});
    }

    async listVideos({ maxResults = 60, fields = DEFAULT_DISPLAY_VIDEO_FIELDS } = {}) {
        const videos = [];
        let cursor = undefined;
        let hasMore = true;

        while (videos.length < maxResults && hasMore) {
            const maxCount = Math.min(20, maxResults - videos.length);
            const body = { max_count: maxCount };
            if (cursor !== undefined) body.cursor = cursor;

            const page = await this.request('/v2/video/list/', {
                method: 'POST',
                query: { fields: fields.join(',') },
                body,
            });

            const data = page?.data || {};
            videos.push(...(data.videos || []).map(mapDisplayVideo));
            cursor = data.cursor;
            hasMore = Boolean(data.has_more);
        }

        return videos.slice(0, maxResults);
    }
}

export class TikTokContentPostingClient {
    constructor({ accessToken, baseUrl } = {}) {
        this.accessToken = accessToken;
        this.baseUrl = baseUrl || loadApiConfig().baseUrl || 'https://open.tiktokapis.com';
        if (!this.accessToken) {
            throw new Error('Missing credentials: TIKTOK_USER_ACCESS_TOKEN');
        }
    }

    async request(path, { method = 'GET', query = {}, body } = {}) {
        const url = new URL(path, this.baseUrl);
        for (const [key, value] of Object.entries(query)) {
            if (value === undefined || value === null || value === '') continue;
            url.searchParams.set(key, String(value));
        }

        const response = await fetch(url, {
            method,
            headers: {
                Authorization: `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json; charset=UTF-8',
            },
            body: body ? JSON.stringify(body) : undefined,
        });
        const json = await response.json().catch(() => ({}));
        const errorCode = json?.error?.code;
        if (!response.ok || (errorCode && errorCode !== 'ok')) {
            const message = json?.error?.message || json?.error_description || json?.message || `${response.status} ${response.statusText}`;
            const error = new Error(`TikTok Content Posting API error for ${path}: ${message || errorCode}`);
            error.status = response.status;
            error.payload = json;
            throw error;
        }
        return json;
    }

    async queryCreatorInfo() {
        const page = await this.request('/v2/post/publish/creator_info/query/', {
            method: 'POST',
            body: {},
        });
        return page?.data || {};
    }

    async initPhotoPost({
        photoUrls,
        title = '',
        description = '',
        postMode = 'DIRECT_POST',
        privacyLevel = 'SELF_ONLY',
        coverIndex = 0,
        disableComment = false,
        autoAddMusic = false,
        brandContentToggle = false,
        brandOrganicToggle = false,
    }) {
        const mode = normalizePhotoPostMode(postMode);
        validatePhotoPostInput({ photoUrls, title, description, coverIndex });

        const postInfo = {
            ...(title ? { title } : {}),
            ...(description ? { description } : {}),
        };

        if (mode === 'DIRECT_POST') {
            postInfo.privacy_level = privacyLevel;
            postInfo.disable_comment = Boolean(disableComment);
            postInfo.auto_add_music = Boolean(autoAddMusic);
            postInfo.brand_content_toggle = Boolean(brandContentToggle);
            postInfo.brand_organic_toggle = Boolean(brandOrganicToggle);
        }

        const page = await this.request('/v2/post/publish/content/init/', {
            method: 'POST',
            body: {
                post_info: postInfo,
                source_info: {
                    source: 'PULL_FROM_URL',
                    photo_cover_index: coverIndex,
                    photo_images: photoUrls,
                },
                post_mode: mode,
                media_type: 'PHOTO',
            },
        });
        return page?.data || {};
    }

    async initVideoPost({
        videoSize,
        videoUrl,
        postMode = 'DIRECT_POST',
        title = '',
        privacyLevel = 'SELF_ONLY',
        disableComment = false,
        disableDuet = false,
        disableStitch = false,
        videoCoverTimestampMs = 0,
        preferredChunkSize,
    }) {
        const mode = normalizeVideoPostMode(postMode);
        const sourceInfo = buildTikTokVideoSourceInfo({
            videoSize,
            videoUrl,
            preferredChunkSize,
        });
        const body = { source_info: sourceInfo };

        if (mode === 'DIRECT_POST') {
            body.post_info = {
                title: String(title || ''),
                privacy_level: privacyLevel,
                disable_comment: Boolean(disableComment),
                disable_duet: Boolean(disableDuet),
                disable_stitch: Boolean(disableStitch),
                video_cover_timestamp_ms: Number(videoCoverTimestampMs) || 0,
            };
        }

        const endpoint = mode === 'DIRECT_POST'
            ? '/v2/post/publish/video/init/'
            : '/v2/post/publish/inbox/video/init/';
        const page = await this.request(endpoint, {
            method: 'POST',
            body,
        });
        return page?.data || {};
    }

    async createVideoPostFromFile({ filePath, fetchImpl = globalThis.fetch, ...options }) {
        const file = await inspectTikTokVideoFile(filePath);
        const plan = buildTikTokUploadPlan(file.size, options.preferredChunkSize);
        const initialized = await this.initVideoPost({
            ...options,
            videoSize: file.size,
        });
        if (!initialized.publish_id || !initialized.upload_url) {
            throw new Error(`TikTok video init response is missing publish_id or upload_url: ${JSON.stringify(initialized)}`);
        }

        const upload = await uploadTikTokVideoFile({
            uploadUrl: initialized.upload_url,
            filePath: file.path,
            contentType: file.contentType,
            chunkSize: plan.chunkSize,
            fetchImpl,
        });
        return { ...initialized, file, upload };
    }

    async waitForPost({ publishId, pollIntervalMs = 10_000, timeoutMs = 900_000 }) {
        const deadline = Date.now() + timeoutMs;
        let lastStatus = null;
        while (Date.now() <= deadline) {
            lastStatus = await this.fetchPostStatus({ publishId });
            if (isTikTokPostTerminal(lastStatus)) return lastStatus;
            await new Promise((resolvePromise) => setTimeout(resolvePromise, pollIntervalMs));
        }
        throw new Error(`Timed out waiting for TikTok post ${publishId}: ${JSON.stringify(lastStatus)}`);
    }

    async fetchPostStatus({ publishId }) {
        if (!publishId) throw new Error('Missing publish id');
        const page = await this.request('/v2/post/publish/status/fetch/', {
            method: 'POST',
            body: { publish_id: publishId },
        });
        return page?.data || {};
    }
}

export function getDisplayUserFields(scope = '') {
    const scopes = new Set(String(scope).split(/[,\s]+/).map((item) => item.trim()).filter(Boolean));
    const fields = [...BASIC_DISPLAY_USER_FIELDS];
    if (scopes.has('user.info.profile')) {
        fields.push('bio_description', 'profile_deep_link', 'is_verified');
    }
    if (scopes.has('user.info.stats')) {
        fields.push('follower_count', 'following_count', 'likes_count', 'video_count');
    }
    return fields;
}

export function normalizePhotoPostMode(value) {
    const mode = String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
    if (mode === 'DIRECT_POST' || mode === 'MEDIA_UPLOAD') return mode;
    throw new Error(`Invalid photo post mode: ${value}. Use DIRECT_POST or MEDIA_UPLOAD.`);
}

export function normalizeVideoPostMode(value) {
    const mode = String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
    if (mode === 'DIRECT_POST' || mode === 'MEDIA_UPLOAD') return mode;
    throw new Error(`Invalid video post mode: ${value}. Use DIRECT_POST or MEDIA_UPLOAD.`);
}

export function buildTikTokUploadPlan(videoSize, preferredChunkSize = 64 * 1024 * 1024) {
    const size = Number(videoSize);
    if (!Number.isSafeInteger(size) || size <= 0) {
        throw new Error(`TikTok video size must be a positive integer; got ${videoSize}`);
    }
    if (size > 4 * 1024 * 1024 * 1024) {
        throw new Error('TikTok video files must be 4 GB or smaller.');
    }

    const minChunk = 5 * 1024 * 1024;
    const maxChunk = 64 * 1024 * 1024;
    const maxFinalChunk = 128 * 1024 * 1024;
    if (size <= maxFinalChunk) {
        return { videoSize: size, chunkSize: size, totalChunkCount: 1 };
    }

    const chunkSize = Math.min(maxChunk, Math.max(minChunk, Number(preferredChunkSize) || maxChunk));
    const totalChunkCount = Math.floor(size / chunkSize);
    const finalChunkSize = size - (chunkSize * (totalChunkCount - 1));
    if (finalChunkSize > maxFinalChunk) {
        throw new Error(`TikTok final upload chunk would exceed 128 MB: ${finalChunkSize} bytes`);
    }
    return { videoSize: size, chunkSize, totalChunkCount };
}

export function buildTikTokVideoSourceInfo({ videoSize, videoUrl, preferredChunkSize } = {}) {
    if (videoUrl) {
        const parsed = new URL(videoUrl);
        if (parsed.protocol !== 'https:') {
            throw new Error(`TikTok video URL must use https: ${videoUrl}`);
        }
        return { source: 'PULL_FROM_URL', video_url: parsed.toString() };
    }

    const plan = buildTikTokUploadPlan(videoSize, preferredChunkSize);
    return {
        source: 'FILE_UPLOAD',
        video_size: plan.videoSize,
        chunk_size: plan.chunkSize,
        total_chunk_count: plan.totalChunkCount,
    };
}

export async function inspectTikTokVideoFile(filePath) {
    const path = resolve(String(filePath || ''));
    const details = await stat(path).catch(() => null);
    if (!details?.isFile()) throw new Error(`TikTok video file does not exist: ${path}`);

    const contentTypes = {
        '.mp4': 'video/mp4',
        '.mov': 'video/quicktime',
        '.webm': 'video/webm',
    };
    const contentType = contentTypes[extname(path).toLowerCase()];
    if (!contentType) {
        throw new Error('TikTok video must be an MP4, MOV, or WebM file.');
    }
    buildTikTokUploadPlan(details.size);
    return { path, size: details.size, contentType };
}

export async function uploadTikTokVideoFile({
    uploadUrl,
    filePath,
    contentType,
    chunkSize,
    fetchImpl = globalThis.fetch,
}) {
    if (!uploadUrl) throw new Error('Missing TikTok upload URL');
    const file = await inspectTikTokVideoFile(filePath);
    const plan = buildTikTokUploadPlan(file.size, chunkSize);
    const handle = await open(file.path, 'r');
    let uploadedBytes = 0;

    try {
        for (let index = 0; index < plan.totalChunkCount; index += 1) {
            const firstByte = uploadedBytes;
            const isFinal = index === plan.totalChunkCount - 1;
            const bytesToRead = isFinal ? file.size - uploadedBytes : plan.chunkSize;
            const buffer = Buffer.allocUnsafe(bytesToRead);
            const { bytesRead } = await handle.read(buffer, 0, bytesToRead, firstByte);
            if (bytesRead !== bytesToRead) {
                throw new Error(`Could not read TikTok upload chunk ${index + 1}; expected ${bytesToRead} bytes, got ${bytesRead}`);
            }
            const lastByte = firstByte + bytesRead - 1;
            const response = await fetchImpl(uploadUrl, {
                method: 'PUT',
                headers: {
                    'Content-Type': contentType || file.contentType,
                    'Content-Length': String(bytesRead),
                    'Content-Range': `bytes ${firstByte}-${lastByte}/${file.size}`,
                },
                body: buffer,
            });
            const expectedStatus = isFinal ? 201 : 206;
            if (response.status !== expectedStatus) {
                const detail = await response.text().catch(() => '');
                throw new Error(`TikTok video upload chunk ${index + 1} failed: ${response.status} ${response.statusText}${detail ? ` - ${detail}` : ''}`);
            }
            uploadedBytes += bytesRead;
        }
    } finally {
        await handle.close();
    }

    return {
        bytesUploaded: uploadedBytes,
        chunkSize: plan.chunkSize,
        totalChunkCount: plan.totalChunkCount,
    };
}

function isTikTokPostTerminal(status) {
    const value = String(status?.status || '').toUpperCase();
    return ['PUBLISH_COMPLETE', 'SEND_TO_USER_INBOX', 'FAILED', 'PUBLISH_FAILED'].includes(value);
}

function validatePhotoPostInput({ photoUrls, title, description, coverIndex }) {
    if (!Array.isArray(photoUrls) || photoUrls.length < 1 || photoUrls.length > 35) {
        throw new Error('TikTok photo posts require 1-35 image URLs.');
    }
    if (!Number.isInteger(coverIndex) || coverIndex < 0 || coverIndex >= photoUrls.length) {
        throw new Error(`Photo cover index must be between 0 and ${photoUrls.length - 1}.`);
    }
    if (Array.from(String(title || '')).length > 90) {
        throw new Error('TikTok photo post title must be 90 characters or fewer.');
    }
    if (Array.from(String(description || '')).length > 4000) {
        throw new Error('TikTok photo post description must be 4000 characters or fewer.');
    }

    for (const url of photoUrls) {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:') {
            throw new Error(`TikTok photo URL must use https: ${url}`);
        }
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

function usernameFromShareUrl(shareUrl) {
    if (!shareUrl) return '';
    const match = String(shareUrl).match(/tiktok\.com\/@([^/]+)/);
    return match ? match[1] : '';
}

function isoFromCreateTime(createTime) {
    const seconds = toNumber(createTime, null);
    if (!seconds) return '';
    return new Date(seconds * 1000).toISOString();
}

function mapDisplayVideo(item) {
    const id = item.id || '';
    const creator = usernameFromShareUrl(item.share_url);
    return {
        platform: 'tiktok',
        id,
        url: item.share_url || (creator && id ? `https://www.tiktok.com/@${creator}/video/${id}` : ''),
        creator,
        caption: item.video_description || item.title || '',
        views: toNumber(item.view_count),
        likes: toNumber(item.like_count),
        comments: toNumber(item.comment_count),
        shares: toNumber(item.share_count),
        postedAt: isoFromCreateTime(item.create_time),
        durationSeconds: toNumber(item.duration, null),
        source: 'tiktok_display_api',
    };
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

function mapDisplayUser(data) {
    return {
        openId: data.open_id || '',
        unionId: data.union_id || '',
        username: data.username || '',
        displayName: data.display_name || '',
        followers: toNumber(data.follower_count),
        following: toNumber(data.following_count),
        likes: toNumber(data.likes_count),
        videoCount: toNumber(data.video_count),
        isVerified: Boolean(data.is_verified),
        bio: data.bio_description || '',
        avatarUrl: data.avatar_url || '',
        profileUrl: data.profile_deep_link || '',
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
