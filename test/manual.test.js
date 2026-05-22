import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeManualRow } from '../src/manual.js';
import { scoreManualRows } from '../src/finder.js';

test('normalizeManualRow accepts common worksheet column aliases', () => {
    const row = normalizeManualRow({
        creator_handle: '@small_dev',
        view_count: '100000',
        follower_count: '10000',
        hook_text: 'POV the pager rings',
    });

    assert.equal(row.creator, 'small_dev');
    assert.equal(row.views, 100000);
    assert.equal(row.followers, 10000);
    assert.equal(row.caption, 'POV the pager rings');
});

test('scoreManualRows ranks by views per follower', () => {
    const results = scoreManualRows([
        { creator: 'a', views: 100000, followers: 10000, caption: 'a' },
        { creator: 'b', views: 120000, followers: 80000, caption: 'b' },
    ]);

    assert.equal(results[0].creator, 'a');
    assert.equal(results[0].viewsPerFollower, 10);
});
