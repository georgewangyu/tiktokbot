# TikTokBot Agent Instructions

## Required Startup Context

At the start of a session in this repository, read:

1. `README.md`
2. `VISION.md`

## Mission

`tiktokbot` is a TikTok breakout-finding and own-account analysis CLI. Keep the
difference between official account analytics, research-only APIs, and brittle
public web collection explicit at all times.

## Working Rules

1. Read `VISION.md` before changing collector strategy or product direction.
2. Treat Display API own-account analytics as the stable official path.
3. Treat Research API and public-web probing as conditional, brittle, or
   eligibility-gated surfaces.
4. Keep the manual worksheet scorer first-class because it preserves value even
   when official discovery access is blocked.

## Validation

```bash
npm run env
npm test
```
