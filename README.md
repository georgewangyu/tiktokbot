---
doc_schema: "doc-frontmatter-v1"
doc_id: "tiktokbot/README"
doc_type: "readme"
doc_status: "active"
title: "tiktokbot - TikTok Breakout Finder"
description: "CLI for finding low-follower, high-view TikTok videos using Research API metadata or manual worksheets."
memory_eligible: false
memory_priority: "low"
doc_tags:
  - "domain:social-media"
  - "tool:tiktokbot"
  - "type:readme"
---
# tiktokbot - TikTok Breakout Finder

CLI for finding TikTok inspiration videos where a low-follower creator has a high-performing post.

This is the TikTok sibling of `youtubebot`, but TikTok's official access model is much more constrained:

- YouTube Data API is mostly self-serve once you have a Google Cloud project.
- TikTok Research API can expose the right data for breakout scouting, but it is for qualifying academic/not-for-profit/public-interest researchers, not ordinary creator tooling.
- TikTok Display API can expose an authorized user's own profile and videos after OAuth, including stats fields, but not broad public discovery.
- This repo includes a manual worksheet scorer so the scoring workflow is useful before Research API approval.

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
|   `-- tiktok.js        # TikTok Research API client
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

## Access Reality

For George's likely use case, assume Research API access is not available unless there is a real eligible research affiliation and public-interest proposal.

Practical tracks:

1. **Manual worksheet scorer now**: collect creator/video rows manually and rank them with `score-file`.
2. **Display API later**: OAuth into George's own TikTok account and analyze his own videos/baseline.
3. **Research API only if eligible**: academic/not-for-profit/public-interest application, with approval expected to take weeks.
4. **Unofficial/public probing**: possible later, but separate because it is brittle and policy-sensitive.

## Credentials

Set these in `tiktokbot/.env`, `~/.config/tiktokbot/.env`, a file referenced by `TIKTOKBOT_ENV_FILE`, or the shell:

```env
TIKTOK_CLIENT_KEY=...
TIKTOK_CLIENT_SECRET=...
TIKTOK_RESEARCH_ACCESS_TOKEN=...
TIKTOK_OPEN_API_BASE_URL=https://open.tiktokapis.com
```

Check config:

```bash
node src/cli.js env
```

Fetch a client access token:

```bash
node src/cli.js client-token
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
- API approval is the main blocker, not local code.
- TikTok Content Posting API is separate and should be considered later for publishing, not discovery.
