# TikTok API Setup

TikTok does not have a Google Cloud equivalent where the whole low-follower/high-view discovery flow is a self-serve API-key toggle.

## Reality Check

The Research API is probably not available for ordinary creator-tooling use cases.

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
node src/cli.js user example_creator
```

8. Smoke test a keyword search:

```bash
node src/cli.js find "software engineer" --field keyword --region US --min-views 50000 --max-followers 100000
```

## Practical Path For Us: Display API

Display API is the practical official OAuth path. It will not discover
arbitrary creators, but it can analyze the authorized account.

Manual setup:

1. Create a TikTok for Developers account.
2. Create an app.
3. Add/configure Login Kit and TikTok API / Display API products.
4. Request or enable these scopes for the app:
   - `user.info.basic`
   - `user.info.profile`
   - `user.info.stats`
   - `video.list`
5. Add a redirect URI in the Login Kit product config.

Important redirect URI constraint: TikTok's web flow expects a registered static redirect URI. For the desktop Login Kit flow, a loopback URI with an explicit port is supported, for example:

```text
http://127.0.0.1:3455/callback/
```

Register the exact URI in the same app environment you are using, such as sandbox vs production.

Then set:

```env
TIKTOK_CLIENT_KEY=...
TIKTOK_CLIENT_SECRET=...
TIKTOK_REDIRECT_URI=http://127.0.0.1:3455/callback/
```

Generate an auth URL:

```bash
node src/cli.js auth-url
```

The easiest CLI path is the guided OAuth setup:

```bash
node src/cli.js oauth-login
```

It prints the authorization URL, asks you to paste the callback URL or code, exchanges it, and saves `TIKTOK_USER_ACCESS_TOKEN` / `TIKTOK_USER_REFRESH_TOKEN` into `tiktokbot/.env` by default.

Manual alternative: open the URL, authorize the TikTok account, and copy the `code` query parameter from the redirect URL.

Exchange the code:

```bash
node src/cli.js exchange-code '<callback-url-or-code>' --save
```

Save the returned tokens:

```env
TIKTOK_USER_ACCESS_TOKEN=...
TIKTOK_USER_REFRESH_TOKEN=...
```

Smoke test:

```bash
node src/cli.js me
node src/cli.js my-videos --max-results 20 --format json
node src/cli.js my-outliers --max-results 60 --baseline-videos 12
```

Refresh later:

```bash
node src/cli.js refresh-token --save
```

### Token Lifecycle and Automatic Recovery

TikTok's user access token is valid for 24 hours and its refresh token is
normally valid for 365 days. A successful OAuth exchange or refresh now saves
non-secret lifecycle metadata alongside the private tokens:

```env
TIKTOK_USER_TOKEN_UPDATED_AT=...
TIKTOK_USER_ACCESS_TOKEN_EXPIRES_AT=...
TIKTOK_USER_REFRESH_TOKEN_EXPIRES_AT=...
```

TikTokBot automatically refreshes and retries once for official own-account
analytics and posting commands when either:

- the saved access-token expiry is within one minute; or
- TikTok rejects the access token as invalid or expired.

The refresh response can rotate the refresh token, so the bot saves the full
response before retrying. It never retries more than once. If the refresh token
is expired, revoked, or belongs to a different app, run `oauth-login` again and
authorize the account.

Older token files may not contain lifecycle timestamps. They remain supported:
the first invalid-token response triggers the same refresh-and-retry path, then
the bot adds the timestamps for subsequent checks.

## Optional Path: Content Posting API

Use this when posting videos or static photo carousels from `tiktokbot`.
This is separate from Display API analytics.

TikTok photo posts use the Content Posting API endpoint
`/v2/post/publish/content/init/` with `media_type=PHOTO`.

Requirements:

- Add the Content Posting API product to the TikTok developer app.
- Enable Direct Post if direct publishing is needed.
- Get `video.publish` approval for direct posts.
- Get `video.upload` approval for draft/inbox uploads.
- Reauthorize the TikTok user after those scopes are available:

```bash
node src/cli.js oauth-login --posting
```

Check the saved token scope afterward:

```bash
node src/cli.js env
```

It should include `video.publish` and/or `video.upload`.

For local desktop OAuth, prefer the guided flow:

```bash
node src/cli.js oauth-login --posting
```

This flow generates the TikTok-compatible PKCE challenge, keeps the verifier in
memory, validates the returned `state`, exchanges the code, and saves the user
tokens. If the TikTok authorization page returns `param_error` for
`code_challenge`, restart the guided command and copy the full printed URL into
the browser; partial URLs can silently drop required PKCE parameters.

Before direct posting, query creator info and use one of the returned privacy
levels:

```bash
node src/cli.js posting-info
```

Validate and upload a local MP4/MOV/WebM video to the creator inbox:

```bash
node src/cli.js video-post ./final-video.mp4 --mode MEDIA_UPLOAD --dry-run
node src/cli.js video-post ./final-video.mp4 --mode MEDIA_UPLOAD
```

The inbox route uses `video.upload` and requires the creator to finish the post
in TikTok's native creation flow. Direct Post uses `video.publish`:

```bash
node src/cli.js video-post ./final-video.mp4 \
  --mode DIRECT_POST \
  --title 'Approved caption #topic' \
  --privacy-level SELF_ONLY
```

The CLI transfers local files with TikTok's `FILE_UPLOAD` byte-range protocol,
polls the returned publish ID, and refreshes an expired posting token once. A
verified HTTPS URL can be supplied instead, but it remains subject to TikTok's
URL-ownership gate.

Static photo carousel example:

```bash
node src/cli.js photo-post \
  'https://static.example.com/tiktok/slide-1.jpg' \
  'https://static.example.com/tiktok/slide-2.jpg' \
  --title 'Carousel title' \
  --description 'Carousel caption' \
  --privacy-level SELF_ONLY \
  --auto-add-music true
```

Draft upload example:

```bash
node src/cli.js photo-post \
  'https://static.example.com/tiktok/slide-1.jpg' \
  'https://static.example.com/tiktok/slide-2.jpg' \
  --mode MEDIA_UPLOAD \
  --title 'Carousel title' \
  --description 'Carousel caption'
```

Important media constraints:

- Local videos must be MP4, MOV, or WebM and no larger than 4 GB.
- TikTok video chunks are 5-64 MB, with a final chunk up to 128 MB; small files
  are sent as one chunk.
- Photo URLs must be public HTTPS URLs.
- URLs must be under a domain or URL prefix verified in the TikTok developer app.
- The URLs should not redirect.
- Images must be JPEG/JPG or WebP, not PNG.
- TikTok allows up to 35 photo URLs per post.

For existing carousel exports, convert static PNG posters
to JPEG or WebP first. The Instagram MP4-per-slide motion carousel format does
not map to TikTok photo posts; use a single vertical video if motion is required.

### Current Platform Gates Observed

The CLI can authenticate and build valid Content Posting API requests, but
TikTok still enforces app/account gates at publish time:

- `unaudited_client_can_only_post_to_private_accounts`: Direct Post can be
  blocked for unaudited apps even when the user token has `video.publish`.
  Posting with `privacy_level=SELF_ONLY` is not enough if TikTok requires the
  account itself to be private during unaudited testing. For public-account
  direct posting, complete TikTok's app audit/integration review.
- `url_ownership_unverified`: Photo posts use `PULL_FROM_URL`; the media URLs
  must be under a verified domain or URL prefix in the TikTok developer app.
  A public `HEAD 200` S3 object is necessary but not sufficient.

For a draft/inbox style photo carousel test, first verify the exact media URL
prefix in the TikTok developer console, then retry:

```bash
node src/cli.js photo-post \
  'https://verified.example.com/tiktok/slide-1.jpg' \
  'https://verified.example.com/tiktok/slide-2.jpg' \
  --mode MEDIA_UPLOAD \
  --title 'Carousel title' \
  --description 'Carousel caption'
```

## Manual Competitor Test

Use a manual worksheet for competitor scouting:

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

1. **Seeded watchlist/manual public review**: useful for low-follower/high-view scouting without relying on Research API.
2. **Unofficial public probing**: only after deciding the reliability and policy tradeoff is acceptable.

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
- Login Kit for Web: https://developers.tiktok.com/doc/login-kit-web/
- OAuth user access token management: https://developers.tiktok.com/doc/oauth-user-access-token-management/
- Display API user info: https://developers.tiktok.com/doc/tiktok-api-v2-get-user-info
- Display API video object: https://developers.tiktok.com/doc/tiktok-api-v2-video-object
- Client access token: https://developers.tiktok.com/doc/client-access-token-management
- Content Posting API: https://developers.tiktok.com/doc/content-posting-api-get-started
