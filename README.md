# tiktokbot - TikTok Breakout Finder

CLI for finding TikTok inspiration videos where a low-follower creator has a high-performing post.

This is the TikTok sibling of `youtubebot`, but TikTok's official access model is much more constrained:

- YouTube Data API is mostly self-serve once you have a Google Cloud project.
- TikTok Research API can expose the right data for breakout scouting, but it is for qualifying academic/not-for-profit/public-interest researchers, not ordinary creator tooling.
- TikTok Display API can expose an authorized user's own profile and videos after OAuth, including stats fields, but not broad public discovery.
- This repo includes a manual worksheet scorer so the scoring workflow is useful before Research API approval.

## Status

This repo is runnable and split across three practical paths:

- manual worksheet scoring for public research now
- official OAuth-backed own-account analytics now
- experimental or eligibility-gated public discovery paths when available

## Architecture

```text
tiktokbot/
|-- src/
|   |-- cli.js           # Unified CLI
|   |-- credentials.js   # .env + private token loader
|   |-- finder.js        # Research API/manual row scoring and ranking
|   |-- manual.js        # CSV/JSON/JSONL worksheet loader
|   |-- oauth.js         # TikTok client credentials token helper
|   |-- output.js        # Table/JSON/JSONL output
|   |-- scoring.js       # Baseline, views/follower, velocity scoring
|   |-- tiktok.js        # TikTok official API clients
|   `-- web.js           # Experimental Playwright-backed public web adapter
|-- setup/
|   `-- TIKTOK_API_SETUP.md
|-- research/
|   `-- ACCESS_NOTES.md
|-- examples/
|   `-- manual-breakouts.csv
|-- README.md
`-- .env.example
```

## Installation

```bash
npm install
```

## Validation

```bash
npm run env
npm test
```

## Access Reality

For most creator-research workflows, assume Research API access is not available unless there is a real eligible research affiliation and public-interest proposal.

Practical tracks:

1. **Manual worksheet scorer now**: collect creator/video rows manually and rank them with `score-file`.
2. **Display API now**: OAuth into an owned TikTok account and analyze its own videos/baseline.
3. **Research API only if eligible**: academic/not-for-profit/public-interest application, with approval expected to take weeks.
4. **Unofficial/public probing**: Playwright-backed web search/trending is available as an experimental path, but it is brittle and policy-sensitive.

## Credentials

Set these in `tiktokbot/.env`, `~/.config/tiktokbot/.env`, a file referenced by `TIKTOKBOT_ENV_FILE`, or the shell:

```env
TIKTOK_CLIENT_KEY=...
TIKTOK_CLIENT_SECRET=...
TIKTOK_REDIRECT_URI=https://example.com/tiktok/callback
TIKTOK_USER_ACCESS_TOKEN=...
TIKTOK_USER_REFRESH_TOKEN=...
TIKTOK_USER_SCOPE=user.info.basic,user.info.profile,user.info.stats,video.list
TIKTOK_RESEARCH_ACCESS_TOKEN=...
TIKTOK_OPEN_API_BASE_URL=https://open.tiktokapis.com
TIKTOK_MS_TOKEN=...
TIKTOK_WEB_BROWSER=chromium
TIKTOK_WEB_MUTE_AUDIO=true
TIKTOK_PYTHON_BIN=python3
```

`TIKTOK_MS_TOKEN` is optional for `web-trending`, but usually needed for `web-search`. To get it, open TikTok in your browser, log in, perform one normal search, then copy the `msToken` cookie value for `www.tiktok.com` / `.tiktok.com` into your private `.env`. Do not commit it.

For Content Posting API photo/video publishing, the app and user token also
need `video.publish` for direct posts and/or `video.upload` for draft uploads:

```env
TIKTOK_USER_SCOPE=user.info.basic,user.info.profile,user.info.stats,video.list,video.publish,video.upload
```

Check config:

```bash
node src/cli.js env
```

Fetch a client access token:

```bash
node src/cli.js client-token
```

Generate a TikTok Login Kit authorization URL for Display API:

```bash
node src/cli.js auth-url
```

Run the guided OAuth flow and save returned user tokens to `tiktokbot/.env`:

```bash
node src/cli.js oauth-login
```

Include Content Posting API scopes during OAuth after the TikTok app has those
scopes approved/enabled:

```bash
node src/cli.js oauth-login --posting
```

Or exchange the returned callback URL / `code` manually:

```bash
node src/cli.js exchange-code '<callback-url-or-code>' --save
```

Refresh a user token:

```bash
node src/cli.js refresh-token --save
```

## Usage

Score a manually collected worksheet:

```bash
node src/cli.js score-file examples/manual-breakouts.csv \
  --max-followers 100000 \
  --min-views 50000
```

Find public videos through the TikTok Research API, only if approved:

```bash
node src/cli.js find "software engineer" \
  --field keyword \
  --region US \
  --max-followers 100000 \
  --min-views 50000 \
  --days 30
```

Search by hashtag:

```bash
node src/cli.js find "devlife" \
  --field hashtag_name \
  --region US \
  --max-followers 100000 \
  --min-views 50000 \
  --format json
```

Inspect one creator:

```bash
node src/cli.js user snackoverflowgeorge
```

Inspect the OAuth-authorized account:

```bash
node src/cli.js me
```

Fetch the OAuth-authorized account's recent videos:

```bash
node src/cli.js my-videos --max-results 60 --format json
```

Rank the OAuth-authorized account's own video outliers:

```bash
node src/cli.js my-outliers --max-results 60 --baseline-videos 12
```

Run the daily-style own-account check: follower count plus recent videos above a creator-baseline multiplier:

```bash
node src/cli.js check --min-outlier 2 --max-results 60
```

Check Content Posting API creator settings for the authorized account:

```bash
node src/cli.js posting-info
```

Initialize a static TikTok photo carousel from verified public JPEG/WebP URLs:

```bash
node src/cli.js photo-post \
  'https://static.example.com/tiktok/slide-1.jpg' \
  'https://static.example.com/tiktok/slide-2.jpg' \
  --title 'Loop notes' \
  --description 'Static carousel test' \
  --privacy-level SELF_ONLY \
  --auto-add-music true
```

Use `--mode MEDIA_UPLOAD` to send photos to TikTok for completion in the app
instead of direct posting. A successful response with status
`SEND_TO_USER_INBOX` means TikTok sent an inbox notification to the creator; it
does not mean the post is live, visible on the profile, or necessarily listed as
a normal draft. The creator must open the TikTok mobile app inbox notification
and finish the editing/posting flow before status can become `PUBLISH_COMPLETE`.

TikTok photo posts require public HTTPS URLs under a domain or URL prefix
verified in the TikTok developer app. TikTok accepts JPEG, JPG, and WebP images
for this path; convert PNG carousel exports before posting. Unaudited apps can
still be blocked from Direct Post even when OAuth includes `video.publish`; use
inbox upload or complete TikTok app review.

Fetch processing status:

```bash
node src/cli.js post-status 'p_pub_url~v2.123456789'
```

Experimentally search public TikTok web results through a Playwright-backed web session:

```bash
node src/cli.js web-search "software engineer" \
  --max-results 30 \
  --min-views-per-follower 5 \
  --mute-audio true \
  --format table
```

Fetch public trending/FYP-style videos with the same scorer:

```bash
node src/cli.js web-trending --max-results 30 --sort views-per-follower
```

`web-search` and `web-trending` are unofficial scraping adapters inspired by `davidteather/TikTok-Api`. By default, `--backend auto` uses the Python `TikTokApi` package when available, because it currently handles TikTok's stealth/session requirements better than the native Node adapter. The Node adapter remains available with `--backend node`. Browser audio is muted by default to avoid audible autoplay during research; set `--mute-audio false` or `TIKTOK_WEB_MUTE_AUDIO=false` only when you intentionally need to hear media.

Set up the Python backend:

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python -m playwright install chromium
```

Then either run commands from that activated shell or set:

```env
TIKTOK_PYTHON_BIN=.venv/bin/python
```

`web-trending` may work without `TIKTOK_MS_TOKEN`; `web-search` often requires a real TikTok `msToken` cookie from a browser session that has already used search. If blocked, set `TIKTOK_MS_TOKEN`, try `--headless false`, or treat the run as a brittle research probe rather than a guaranteed API.

## Scoring

Primary signal when a manual worksheet has enough rows from the same creator:

```text
outlier_score = target_video_views / creator_recent_video_baseline_views
```

Useful TikTok-native signal:

```text
views_per_follower = target_video_views / creator_followers
```

Engagement fallback:

```text
engagement_proxy = (likes + comments * 5 + shares * 8) / views
```

Default ranking prefers creator-baseline outliers, then views/follower, then engagement proxy.

For `my-outliers`, the baseline is based on the authorized account's recent videos. This is the official-API equivalent of the useful part of `youtubebot`, but scoped to George's own TikTok account.

## Manual Worksheet Columns

CSV, JSON, and JSONL are supported. Useful columns:

- `creator` or `username`
- `followers` or `follower_count`
- `views` or `view_count`
- `likes`, `comments`, `shares`
- `url` or `post_url`
- `caption`, `hook_text`, or `concept_summary`
- `posted_at` or `post_age_days`

See `examples/manual-breakouts.csv`.

## Notes

- Research API windows should stay at 30 days or less.
- Research API approval is the broad-discovery blocker, not local code.
- Display API OAuth is the practical official path for George-owned analytics.
- TikTok Content Posting API is separate from discovery. It supports direct or
  draft photo posting through verified public URLs after posting scopes are
  approved and the user reauthorizes the app.

## Goals

- Keep the manual scorer and own-account analytics path useful even without
  Research API approval.
- Make access constraints legible enough that an agent can choose the right
  collection path.
- Preserve experimental web probing without overselling it.

## Non-Goals

- pretending TikTok offers broad stable public discovery to normal developer apps
- hiding access constraints behind marketing copy
- turning the repo into a generic social-media scheduler
