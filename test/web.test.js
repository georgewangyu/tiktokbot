import assert from 'node:assert/strict';
import test from 'node:test';
import { rankRows } from '../src/finder.js';
import { mapWebVideo } from '../src/web.js';

test('mapWebVideo normalizes TikTok web item payloads', () => {
    const row = mapWebVideo({
        id: '123',
        desc: 'POV the build finally works',
        createTime: 1773908088,
        author: { uniqueId: 'small_dev' },
        authorStats: { followerCount: 10000 },
        stats: { playCount: 250000, diggCount: 12000, commentCount: 80, shareCount: 40 },
        video: { duration: 22 },
    });

    assert.equal(row.creator, 'small_dev');
    assert.equal(row.followers, 10000);
    assert.equal(row.views, 250000);
    assert.equal(row.likes, 12000);
    assert.equal(row.comments, 80);
    assert.equal(row.shares, 40);
    assert.equal(row.durationSeconds, 22);
    assert.equal(row.url, 'https://www.tiktok.com/@small_dev/video/123');
    assert.equal(row.source, 'tiktok_web');
});

test('rankRows scores TikTok web rows by views per follower', () => {
    const rows = [
        mapWebVideo({
            id: 'a',
            author: { uniqueId: 'small' },
            authorStats: { followerCount: 10000 },
            stats: { playCount: 200000 },
        }),
        mapWebVideo({
            id: 'b',
            author: { uniqueId: 'large' },
            authorStats: { followerCount: 100000 },
            stats: { playCount: 300000 },
        }),
    ];

    const results = rankRows(rows, { sort: 'views-per-follower', limit: 2 });

    assert.equal(results[0].creator, 'small');
    assert.equal(results[0].viewsPerFollower, 20);
});

test('rankRows filters by creator baseline outlier threshold', () => {
    const rows = [
        { id: 'hit', creator: 'me', views: 3000, url: '', postedAt: '', source: 'test' },
        { id: 'normal', creator: 'me', views: 1200, url: '', postedAt: '', source: 'test' },
    ];
    const baselineByRow = new Map([
        [rows[0], 1000],
        [rows[1], 1000],
    ]);

    const results = rankRows(rows, {
        creatorsByUsername: new Map([['me', { username: 'me', followers: 100 }]]),
        baselineByRow,
        minOutlierScore: 2,
        sort: 'outlier',
    });

    assert.deepEqual(results.map((row) => row.id), ['hit']);
});
