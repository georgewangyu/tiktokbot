# TikTok Access Notes

## Practical Read

TikTok can technically support the low-follower/high-view scout through the Research API, but that path is not realistically self-serve for George's creator-tooling use case.

The useful broad-discovery path is TikTok Research API, not the Content Posting API. But the Research API is for qualifying researchers affiliated with eligible academic or not-for-profit/public-interest organizations.

For normal developer/creator usage, the official APIs are narrower:

- Display API: OAuth-authorized user's own profile and videos. This is the practical official path for George's own TikTok analytics.
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

## Browser / Public Probe Workarounds

Browser automation can help with public scouting, but it is a different risk profile than API access.

Options:

1. **Human-in-the-loop browser review**
   - Use a browser to open TikTok search/profile pages.
   - Human copies URL, creator, follower count, views, hook text.
   - `tiktokbot score-file` ranks rows.
   - Lowest risk and easiest to maintain.

2. **Assisted browser extraction**
   - Use Playwright/Puppeteer to navigate public pages and extract visible text/links/screenshots.
   - Useful for watchlists and repeatable tabs.
   - Brittle because TikTok markup and anti-bot behavior can change.

3. **Unofficial/private API emulation**
   - Highest coverage, highest breakage/policy risk.
   - Do not make this the default path without an explicit decision.

Recommended near-term: Display API for George's account plus human-in-the-loop/manual rows for competitor scouting.

## Experimental TikTok Web Adapter

`web-search` and `web-trending` use the same broad pattern as
`davidteather/TikTok-Api`: initialize a browser session with Playwright, then
sign and call TikTok web JSON endpoints from that session. The CLI defaults to
`--backend auto`, which uses the Python `TikTokApi` package when available and
falls back to the native Node adapter only when the Python bridge is missing.

Useful endpoints observed in local testing:

- `/api/search/item/full/` for keyword video search
- `/api/recommend/item_list/` for trending/FYP-style videos

Search result payloads include:

- `stats.playCount`
- `stats.diggCount`
- `stats.commentCount`
- `stats.shareCount`
- `author.uniqueId`
- `authorStats.followerCount`

That is enough for the YouTube-bot-style fallback signal:

```text
views_per_follower = stats.playCount / authorStats.followerCount
```

Limitations:

- This is not an official API and can break or get blocked.
- `msToken` is a TikTok browser cookie, not an OAuth token. It should be kept
  in `.env` as `TIKTOK_MS_TOKEN` and never committed.
- `web-trending` can work without `msToken` in local testing.
- `web-search` is more sensitive. It may return an empty response unless
  `TIKTOK_MS_TOKEN` comes from a browser session that has already used TikTok
  search.
- The native Node adapter does not yet fully match the Python package's stealth
  behavior; use `--backend python` for search when the Python dependencies are
  installed.
- Profile/recent-video fetches are more likely to require a stronger browser
  session, a non-headless run, or proxies.
- Treat this adapter as an experimental research source, not as a reliable
  unattended production dependency.

## Product Boundary

This bot should find and rank candidate concepts. It should not auto-post.

Publishing can come later through TikTok Content Posting API, but the immediate value is:

```text
small creator breakout -> why packaging worked -> George-specific twist -> filmable idea
```
