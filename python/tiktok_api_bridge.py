#!/usr/bin/env python3
import argparse
import asyncio
import json
import os
import sys

from TikTokApi import TikTokApi


def parse_bool(value):
    return str(value).lower() not in {"0", "false", "no", "off"}


def to_number(value):
    try:
        if value is None or value == "":
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def map_video(data):
    author = data.get("author") or {}
    author_stats = data.get("authorStats") or data.get("authorStatsV2") or {}
    stats = data.get("stats") or data.get("statsV2") or {}
    video = data.get("video") or {}
    video_id = data.get("id") or ""
    creator = author.get("uniqueId") or author.get("unique_id") or ""
    create_time = to_number(data.get("createTime"))
    posted_at = ""
    if create_time:
        from datetime import datetime, timezone

        posted_at = datetime.fromtimestamp(create_time, timezone.utc).isoformat().replace("+00:00", "Z")

    return {
        "platform": "tiktok",
        "id": video_id,
        "url": f"https://www.tiktok.com/@{creator}/video/{video_id}" if creator and video_id else "",
        "creator": creator,
        "followers": to_number(author_stats.get("followerCount") or author_stats.get("follower_count")),
        "views": to_number(stats.get("playCount") or stats.get("play_count")),
        "likes": to_number(stats.get("diggCount") or stats.get("likeCount") or stats.get("like_count")),
        "comments": to_number(stats.get("commentCount") or stats.get("comment_count")),
        "shares": to_number(stats.get("shareCount") or stats.get("share_count")),
        "caption": data.get("desc") or "",
        "postedAt": posted_at,
        "durationSeconds": to_number(video.get("duration")),
        "source": "tiktok_api_python",
    }


async def collect(args):
    ms_token = os.environ.get("TIKTOK_MS_TOKEN") or None
    ms_tokens = [ms_token] if ms_token else None
    browser_args = ["--mute-audio"] if parse_bool(args.mute_audio) else None
    rows = []

    async with TikTokApi() as api:
        await api.create_sessions(
            num_sessions=1,
            ms_tokens=ms_tokens,
            headless=parse_bool(args.headless),
            browser=args.browser,
            override_browser_args=browser_args,
            sleep_after=1,
        )

        if args.command == "search":
            async for video in api.search.search_type(args.query, "item", count=args.max_results):
                rows.append(map_video(video.as_dict))
                if len(rows) >= args.max_results:
                    break
        elif args.command == "trending":
            async for video in api.trending.videos(count=args.max_results):
                rows.append(map_video(video.as_dict))
                if len(rows) >= args.max_results:
                    break
        else:
            raise ValueError(f"Unsupported command: {args.command}")

    return rows


def main():
    parser = argparse.ArgumentParser(description="TikTokApi bridge for tiktokbot")
    parser.add_argument("command", choices=["search", "trending"])
    parser.add_argument("--query", default="")
    parser.add_argument("--max-results", type=int, default=30)
    parser.add_argument("--browser", default="chromium")
    parser.add_argument("--headless", default="true")
    parser.add_argument("--mute-audio", default="true")
    args = parser.parse_args()

    try:
        rows = asyncio.run(collect(args))
        print(json.dumps(rows))
    except Exception as error:
        print(f"tiktok_api_bridge error: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
