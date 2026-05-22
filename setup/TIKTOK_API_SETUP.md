# TikTok API Setup

TikTok does not have a Google Cloud equivalent where the whole low-follower/high-view discovery flow is a self-serve API-key toggle.

## Reality Check

The Research API is probably not available for George's normal creator-tooling use case.

TikTok says applicants must be in an eligible region and affiliated with an eligible academic institution or qualifying not-for-profit / independent research organization. Applicants also need research expertise, independence from commercial interests, funding disclosure, a defined research proposal, data security commitments, and evidence of ethical research review.

So this is not like the YouTube Data API setup. It is closer to a vetted research access program.

## What To Do If Actually Eligible

Only pursue this if there is a real eligible research basis:

1. Create a TikTok for Developers account using a professional research/organization email.
2. Submit the Research Tools application with:
   - organization details
   - research topic/proposal
   - why the requested data is needed and proportionate
   - funding disclosure
   - ethical review evidence
   - collaborator details, if any
3. Wait for approval. TikTok says responses are typically within about 4 weeks, but may take longer.
4. If approved, follow the Getting Started guide and copy app credentials:
   - `client_key`
   - `client_secret`
5. Fetch a client access token:

```bash
node src/cli.js client-token
```

6. Save the returned token in `tiktokbot/.env`:

```env
TIKTOK_RESEARCH_ACCESS_TOKEN=...
```

7. Smoke test a Research API user lookup:

```bash
node src/cli.js user snackoverflowgeorge
```

8. Smoke test a keyword search:

```bash
node src/cli.js find "software engineer" --field keyword --region US --min-views 50000 --max-followers 100000
```

## Practical Path For Us

Use a manual worksheet now:

```bash
node src/cli.js score-file examples/manual-breakouts.csv --max-followers 100000 --min-views 50000
```

Suggested manual collection fields:

- TikTok URL
- creator username
- creator follower count
- video views
- likes
- comments
- shares if visible
- caption or first hook line
- post age/date if visible

This validates the actual product loop without waiting on TikTok approval.

Then add one of these:

1. **Display API / OAuth for George's own account**: useful for analyzing George's own videos and baseline, not broad public discovery.
2. **Seeded watchlist/manual public review**: useful for low-follower/high-view scouting without relying on Research API.
3. **Unofficial public probing**: only after deciding the reliability and policy tradeoff is acceptable.

## Access Reality

For this use case, the useful official data is in the Research API:

- public video query by keyword, hashtag, region, date, views, and related filters
- public video metrics like views, likes, comments, shares, duration, username, and hashtags
- user info such as follower count, likes count, video count, and profile fields

The blocker is approval and allowed-use scope. For a creator tooling project, assume Research API access is unlikely.

## Official Docs

- Research API product/access page: https://developers.tiktok.com/products/research-api/
- Research API video query: https://developers.tiktok.com/doc/research-api-specs-query-videos/
- Research API user info: https://developers.tiktok.com/doc/research-api-specs-query-user-info/
- Display API get started: https://developers.tiktok.com/doc/display-api-get-started/
- Display API video object: https://developers.tiktok.com/doc/tiktok-api-v2-video-object
- Client access token: https://developers.tiktok.com/doc/client-access-token-management
- Content Posting API: https://developers.tiktok.com/doc/content-posting-api-get-started
