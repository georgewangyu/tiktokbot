# TikTok Access Notes

## Practical Read

TikTok can technically support the low-follower/high-view scout through the Research API, but that path is not realistically self-serve for George's creator-tooling use case.

The useful broad-discovery path is TikTok Research API, not the Content Posting API. But the Research API is for qualifying researchers affiliated with eligible academic or not-for-profit/public-interest organizations.

For normal developer/creator usage, the official APIs are narrower:

- Display API: OAuth-authorized user's own profile and videos.
- Content Posting API: posting/uploading.
- Commercial Content API: commercial/ads transparency surfaces, not general creator breakout discovery.

## What We Need For Breakout Scouting

Minimum required fields:

- video id
- username
- video description/caption
- create time
- view count
- like count
- comment count
- share count
- hashtag names
- duration
- follower count for the creator

These fields are enough to compute:

- `views / followers`
- `views / day`
- engagement proxy
- creator baseline if we can query several recent posts by the same username

## What Is Not Solved By OAuth Alone

OAuth/token setup only proves we can call TikTok APIs. It does not guarantee:

- Research API product approval
- broad public search access
- enough rate limit for weekly scouting
- permission to store all raw fields indefinitely

## Fallback Strategy

If Research API access is not available:

1. Use `score-file` with manually collected CSV/JSONL rows.
2. Build a watchlist of creators and hashtags.
3. Add Display API for George's own account analytics.
4. Add a public-page probe only after deciding the policy/risk tradeoff is acceptable.

## Product Boundary

This bot should find and rank candidate concepts. It should not auto-post.

Publishing can come later through TikTok Content Posting API, but the immediate value is:

```text
small creator breakout -> why packaging worked -> George-specific twist -> filmable idea
```
