import assert from 'node:assert/strict';
import test from 'node:test';
import { computeBaseline, scoreVideo } from '../src/scoring.js';

test('computeBaseline uses median by default', () => {
    const baseline = computeBaseline([
        { views: 1000 },
        { views: 3000 },
        { views: 200000 },
    ]);
    assert.equal(baseline, 3000);
});

test('scoreVideo prefers baseline when available', () => {
    const score = scoreVideo({
        video: {
            views: 50000,
            likes: 4000,
            comments: 100,
            shares: 200,
            postedAt: '2026-01-01T00:00:00Z',
        },
        creator: { followers: 5000 },
        baselineViews: 2500,
        now: new Date('2026-01-06T00:00:00Z'),
    });

    assert.equal(score.outlierScore, 20);
    assert.equal(score.viewsPerFollower, 10);
    assert.equal(score.signalStrength, 'baseline');
});

test('scoreVideo falls back to views per follower', () => {
    const score = scoreVideo({
        video: { views: 50000 },
        creator: { followers: 5000 },
    });

    assert.equal(score.score, 10);
    assert.equal(score.signalStrength, 'views_per_follower');
});
