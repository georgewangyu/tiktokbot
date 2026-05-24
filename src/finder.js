import { loadManualRows } from './manual.js';
import { computeBaseline, formatNumber, scoreVideo } from './scoring.js';
import { TikTokDisplayClient, TikTokResearchClient } from './tiktok.js';

function yyyymmdd(date) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}

function dateRangeFromDays(days) {
    const end = new Date();
    const start = new Date(Date.now() - Number(days) * 86400000);
    return {
        startDate: yyyymmdd(start),
        endDate: yyyymmdd(end),
    };
}

function sortResults(results, sort) {
    const key = sort || 'score';
    return results.sort((a, b) => {
        if (key === 'views') return b.views - a.views;
        if (key === 'date') return new Date(b.postedAt || 0) - new Date(a.postedAt || 0);
        if (key === 'velocity') return (b.viewsPerDay || 0) - (a.viewsPerDay || 0);
        if (key === 'followers') return a.followers - b.followers;
        if (key === 'views-per-follower') return (b.viewsPerFollower || 0) - (a.viewsPerFollower || 0);
        if (key === 'outlier') return (b.outlierScore || 0) - (a.outlierScore || 0);
        return (b.breakoutScore || b.score || 0) - (a.breakoutScore || a.score || 0);
    });
}

export async function findResearchOutliers(options) {
    options = {
        days: 30,
        maxResults: 50,
        limit: 20,
        field: 'keyword',
        sort: 'score',
        baselineVideos: 12,
        minBaselineVideos: 3,
        ...options,
    };

    const { startDate, endDate } = options.startDate && options.endDate
        ? { startDate: options.startDate, endDate: options.endDate }
        : dateRangeFromDays(options.days);

    const client = options.client || new TikTokResearchClient();
    const videos = await client.queryVideos({
        query: options.query,
        field: options.field,
        startDate,
        endDate,
        regionCode: options.regionCode,
        minViews: options.minViews,
        maxResults: options.maxResults,
    });

    const creatorsByUsername = new Map();
    for (const username of [...new Set(videos.map((video) => video.creator).filter(Boolean))]) {
        try {
            creatorsByUsername.set(username, await client.queryUserInfo(username));
        } catch (error) {
            creatorsByUsername.set(username, { username, followers: 0, error: error.message });
        }
    }

    return rankRows(videos, {
        creatorsByUsername,
        maxFollowers: options.maxFollowers,
        minViews: options.minViews,
        limit: options.limit,
        sort: options.sort,
    });
}

export function scoreManualFile(filePath, options = {}) {
    const rows = loadManualRows(filePath);
    return scoreManualRows(rows, options);
}

export function scoreManualRows(rows, options = {}) {
    const creatorsByUsername = new Map();
    const grouped = new Map();
    for (const row of rows) {
        const key = row.creator || '';
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(row);
        if (key && !creatorsByUsername.has(key)) {
            creatorsByUsername.set(key, { username: key, followers: row.followers || 0 });
        }
    }

    const baselineById = new Map();
    const minBaselineVideos = options.minBaselineVideos ?? 3;
    const baselineVideos = options.baselineVideos ?? 12;
    for (const videos of grouped.values()) {
        for (const row of videos) {
            const others = videos
                .filter((item) => item !== row && item.views > 0)
                .slice(0, baselineVideos);
            if (others.length >= minBaselineVideos) {
                baselineById.set(row, computeBaseline(others));
            }
        }
    }

    return rankRows(rows, {
        creatorsByUsername,
        baselineByRow: baselineById,
        maxFollowers: options.maxFollowers,
        minViews: options.minViews,
        minViewsPerFollower: options.minViewsPerFollower,
        limit: options.limit ?? 20,
        sort: options.sort ?? 'score',
    });
}

export async function findMyOutliers(options = {}) {
    const client = options.client || new TikTokDisplayClient({ accessToken: options.accessToken });
    const [me, videos] = await Promise.all([
        client.getMe(),
        client.listVideos({ maxResults: options.maxResults ?? 60 }),
    ]);

    const baselineViews = computeBaseline(videos.slice(0, options.baselineVideos ?? 12), options.baselineMethod);
    const rows = videos.map((video) => ({
        ...video,
        creator: video.creator || me.username,
        followers: me.followers,
    }));

    const baselineByRow = new Map(rows.map((row) => {
        const others = rows
            .filter((item) => item.id !== row.id && item.views > 0)
            .slice(0, options.baselineVideos ?? 12);
        return [row, others.length >= (options.minBaselineVideos ?? 3) ? computeBaseline(others, options.baselineMethod) : baselineViews];
    }));

    return rankRows(rows, {
        creatorsByUsername: new Map([[me.username, { username: me.username, followers: me.followers }]]),
        baselineByRow,
        minViews: options.minViews,
        minOutlierScore: options.minOutlierScore,
        limit: options.limit ?? 20,
        sort: options.sort ?? 'score',
    });
}

export function rankRows(rows, options = {}) {
    const results = [];
    for (const row of rows) {
        const creator = options.creatorsByUsername?.get(row.creator) || {
            username: row.creator,
            followers: row.followers || 0,
        };
        const followers = creator.followers || row.followers || 0;
        if (options.maxFollowers !== undefined && followers > options.maxFollowers) continue;
        if (options.minViews !== undefined && row.views < options.minViews) continue;

        const score = scoreVideo({
            video: row,
            creator,
            baselineViews: options.baselineByRow?.get(row) || null,
        });
        if (
            options.minViewsPerFollower !== undefined &&
            (score.viewsPerFollower || 0) < options.minViewsPerFollower
        ) continue;
        if (
            options.minOutlierScore !== undefined &&
            (score.outlierScore || 0) < options.minOutlierScore
        ) continue;

        results.push({
            platform: 'tiktok',
            id: row.id,
            url: row.url,
            creator: row.creator,
            followers,
            views: row.views,
            likes: row.likes,
            comments: row.comments,
            shares: row.shares,
            caption: row.caption,
            postedAt: row.postedAt,
            durationSeconds: row.durationSeconds,
            baselineViews: formatNumber(score.baselineViews, 0),
            outlierScore: formatNumber(score.outlierScore),
            viewsPerFollower: formatNumber(score.viewsPerFollower),
            engagementProxy: formatNumber(score.engagementProxy, 4),
            viewsPerDay: formatNumber(score.viewsPerDay, 0),
            score: formatNumber(score.score),
            breakoutScore: formatNumber(score.breakoutScore),
            signalStrength: score.signalStrength,
            whyFlagged: buildWhyFlagged({ row, followers, score }),
            source: row.source,
        });
    }
    return sortResults(results, options.sort).slice(0, options.limit);
}

function buildWhyFlagged({ row, followers, score }) {
    const parts = [];
    if (score.outlierScore) parts.push(`${score.outlierScore.toFixed(1)}x creator baseline`);
    if (score.viewsPerFollower) parts.push(`${score.viewsPerFollower.toFixed(1)}x followers`);
    if (score.viewsPerDay) parts.push(`${Math.round(score.viewsPerDay).toLocaleString()} views/day`);
    parts.push(`${row.views.toLocaleString()} views`);
    if (followers) parts.push(`${followers.toLocaleString()} followers`);
    return parts.join('; ');
}
