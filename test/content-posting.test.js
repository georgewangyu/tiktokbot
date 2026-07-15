import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import test from 'node:test';
import {
    TikTokContentPostingClient,
    buildTikTokUploadPlan,
    buildTikTokVideoSourceInfo,
    normalizePhotoPostMode,
    normalizeVideoPostMode,
    uploadTikTokVideoFile,
} from '../src/tiktok.js';

test('normalizePhotoPostMode accepts TikTok photo post modes', () => {
    assert.equal(normalizePhotoPostMode('direct post'), 'DIRECT_POST');
    assert.equal(normalizePhotoPostMode('MEDIA_UPLOAD'), 'MEDIA_UPLOAD');
    assert.throws(() => normalizePhotoPostMode('video'), /Invalid photo post mode/);
});

test('initPhotoPost creates a direct photo post payload', async () => {
    const originalFetch = globalThis.fetch;
    const requests = [];
    try {
        globalThis.fetch = async (url, options) => {
            requests.push({
                url: String(url),
                method: options.method,
                headers: options.headers,
                body: JSON.parse(options.body),
            });

            return new Response(JSON.stringify({
                data: { publish_id: 'p_pub_url~v2.123' },
                error: { code: 'ok', message: '', log_id: 'log-1' },
            }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            });
        };

        const client = new TikTokContentPostingClient({
            accessToken: 'test-token',
            baseUrl: 'https://open.test',
        });

        const result = await client.initPhotoPost({
            photoUrls: [
                'https://static.example.com/tiktok/slide-1.jpg',
                'https://static.example.com/tiktok/slide-2.jpg',
            ],
            title: 'Loop notes',
            description: 'Static carousel test',
            privacyLevel: 'SELF_ONLY',
            coverIndex: 1,
            autoAddMusic: true,
        });

        assert.equal(result.publish_id, 'p_pub_url~v2.123');
        assert.equal(requests.length, 1);
        assert.equal(requests[0].url, 'https://open.test/v2/post/publish/content/init/');
        assert.equal(requests[0].method, 'POST');
        assert.equal(requests[0].headers.Authorization, 'Bearer test-token');
        assert.deepEqual(requests[0].body, {
            post_info: {
                title: 'Loop notes',
                description: 'Static carousel test',
                privacy_level: 'SELF_ONLY',
                disable_comment: false,
                auto_add_music: true,
                brand_content_toggle: false,
                brand_organic_toggle: false,
            },
            source_info: {
                source: 'PULL_FROM_URL',
                photo_cover_index: 1,
                photo_images: [
                    'https://static.example.com/tiktok/slide-1.jpg',
                    'https://static.example.com/tiktok/slide-2.jpg',
                ],
            },
            post_mode: 'DIRECT_POST',
            media_type: 'PHOTO',
        });
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('initPhotoPost creates a media upload payload without direct-post fields', async () => {
    const originalFetch = globalThis.fetch;
    let body = null;
    try {
        globalThis.fetch = async (_url, options) => {
            body = JSON.parse(options.body);
            return new Response(JSON.stringify({
                data: { publish_id: 'p_upload_url~v2.123' },
                error: { code: 'ok', message: '', log_id: 'log-1' },
            }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            });
        };

        const client = new TikTokContentPostingClient({
            accessToken: 'test-token',
            baseUrl: 'https://open.test',
        });

        await client.initPhotoPost({
            photoUrls: ['https://static.example.com/tiktok/slide-1.webp'],
            postMode: 'MEDIA_UPLOAD',
            title: 'Draft',
        });

        assert.deepEqual(body.post_info, { title: 'Draft' });
        assert.equal(body.post_mode, 'MEDIA_UPLOAD');
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('fetchPostStatus sends publish_id to status endpoint', async () => {
    const originalFetch = globalThis.fetch;
    let body = null;
    try {
        globalThis.fetch = async (url, options) => {
            assert.equal(String(url), 'https://open.test/v2/post/publish/status/fetch/');
            body = JSON.parse(options.body);
            return new Response(JSON.stringify({
                data: { status: 'PROCESSING_UPLOAD' },
                error: { code: 'ok', message: '', log_id: 'log-1' },
            }), {
                status: 200,
                headers: { 'content-type': 'application/json' },
            });
        };

        const client = new TikTokContentPostingClient({
            accessToken: 'test-token',
            baseUrl: 'https://open.test',
        });
        const status = await client.fetchPostStatus({ publishId: 'p_pub_url~v2.123' });

        assert.deepEqual(body, { publish_id: 'p_pub_url~v2.123' });
        assert.equal(status.status, 'PROCESSING_UPLOAD');
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('buildTikTokUploadPlan keeps small files whole and chunks large files', () => {
    assert.deepEqual(buildTikTokUploadPlan(4 * 1024 * 1024), {
        videoSize: 4 * 1024 * 1024,
        chunkSize: 4 * 1024 * 1024,
        totalChunkCount: 1,
    });
    const large = buildTikTokUploadPlan(200 * 1024 * 1024);
    assert.equal(large.chunkSize, 64 * 1024 * 1024);
    assert.equal(large.totalChunkCount, 3);
    assert.throws(() => buildTikTokUploadPlan(0), /positive integer/);
});

test('initVideoPost selects direct and inbox endpoints', async () => {
    const originalFetch = globalThis.fetch;
    const requests = [];
    try {
        globalThis.fetch = async (url, options) => {
            requests.push({ url: String(url), body: JSON.parse(options.body) });
            return new Response(JSON.stringify({
                data: { publish_id: 'v_test', upload_url: 'https://upload.test/video' },
                error: { code: 'ok', message: '' },
            }), { status: 200, headers: { 'content-type': 'application/json' } });
        };
        const client = new TikTokContentPostingClient({ accessToken: 'token', baseUrl: 'https://open.test' });
        await client.initVideoPost({
            videoSize: 10_000,
            title: 'Caption #tag',
            privacyLevel: 'SELF_ONLY',
        });
        await client.initVideoPost({
            videoUrl: 'https://static.example.com/video.mp4',
            postMode: 'MEDIA_UPLOAD',
        });

        assert.equal(requests[0].url, 'https://open.test/v2/post/publish/video/init/');
        assert.equal(requests[0].body.post_info.title, 'Caption #tag');
        assert.deepEqual(requests[0].body.source_info, {
            source: 'FILE_UPLOAD',
            video_size: 10_000,
            chunk_size: 10_000,
            total_chunk_count: 1,
        });
        assert.equal(requests[1].url, 'https://open.test/v2/post/publish/inbox/video/init/');
        assert.equal(requests[1].body.post_info, undefined);
        assert.deepEqual(requests[1].body.source_info, {
            source: 'PULL_FROM_URL',
            video_url: 'https://static.example.com/video.mp4',
        });
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('uploadTikTokVideoFile sends a complete local file with byte range headers', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tiktokbot-upload-'));
    const filePath = join(root, 'video.mp4');
    await writeFile(filePath, Buffer.from('video-bytes'));
    const requests = [];
    try {
        const result = await uploadTikTokVideoFile({
            uploadUrl: 'https://upload.test/video',
            filePath,
            fetchImpl: async (url, options) => {
                requests.push({ url, options });
                return new Response('', { status: 201 });
            },
        });
        assert.equal(result.bytesUploaded, 11);
        assert.equal(result.totalChunkCount, 1);
        assert.equal(requests[0].options.headers['Content-Range'], 'bytes 0-10/11');
        assert.equal(requests[0].options.headers['Content-Type'], 'video/mp4');
        assert.equal(Buffer.from(requests[0].options.body).toString(), 'video-bytes');
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test('normalizeVideoPostMode and URL validation reject unsafe values', () => {
    assert.equal(normalizeVideoPostMode('direct post'), 'DIRECT_POST');
    assert.equal(normalizeVideoPostMode('media-upload'), 'MEDIA_UPLOAD');
    assert.throws(() => normalizeVideoPostMode('browser'), /Invalid video post mode/);
    assert.throws(() => buildTikTokVideoSourceInfo({ videoUrl: 'http://example.com/video.mp4' }), /must use https/);
});
