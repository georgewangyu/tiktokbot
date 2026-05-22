export function toNumber(value, fallback = 0) {
    if (value === undefined || value === null || value === '') return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export function median(values) {
    const nums = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
    if (nums.length === 0) return null;
    const mid = Math.floor(nums.length / 2);
    if (nums.length % 2 === 1) return nums[mid];
    return (nums[mid - 1] + nums[mid]) / 2;
}

export function ageDays(postedAt, now = new Date()) {
    const posted = new Date(postedAt);
    if (Number.isNaN(posted.getTime())) return null;
    return Math.max((now.getTime() - posted.getTime()) / 86400000, 0.01);
}

export function computeBaseline(videos, method = 'median') {
    const views = videos
        .map((video) => video.views)
        .filter((value) => Number.isFinite(value) && value > 0);
    if (views.length === 0) return null;
    if (method === 'average') {
        return views.reduce((sum, value) => sum + value, 0) / views.length;
    }
    return median(views);
}

export function scoreVideo({ video, creator = {}, baselineViews = null, now = new Date() }) {
    const followers = toNumber(creator.followers ?? video.followers ?? video.creatorFollowers);
    const views = toNumber(video.views);
    const likes = toNumber(video.likes);
    const comments = toNumber(video.comments);
    const shares = toNumber(video.shares);
    const days = video.postedAt ? ageDays(video.postedAt, now) : toNumber(video.postAgeDays, null);
    const viewsPerDay = days ? views / days : null;
    const outlierScore = baselineViews && baselineViews > 0 ? views / baselineViews : null;
    const viewsPerFollower = followers > 0 ? views / followers : null;
    const engagementProxy = views > 0 ? (likes + comments * 5 + shares * 8) / views : null;

    let signalStrength = 'raw_views';
    let score = views;
    if (outlierScore) {
        score = outlierScore;
        signalStrength = 'baseline';
    } else if (viewsPerFollower) {
        score = viewsPerFollower;
        signalStrength = 'views_per_follower';
    } else if (engagementProxy) {
        score = engagementProxy;
        signalStrength = 'engagement_proxy';
    }

    const velocityBoost = viewsPerDay && viewsPerDay > 0 ? Math.max(1, Math.log10(viewsPerDay)) : 1;
    const breakoutScore = score * velocityBoost;

    return {
        score,
        breakoutScore,
        outlierScore,
        viewsPerFollower,
        engagementProxy,
        baselineViews,
        viewsPerDay,
        ageDays: days,
        signalStrength,
    };
}

export function formatNumber(value, digits = 2) {
    if (value === null || value === undefined || !Number.isFinite(value)) return null;
    return Number(value.toFixed(digits));
}
