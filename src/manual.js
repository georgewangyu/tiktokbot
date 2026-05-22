import { readFileSync } from 'fs';
import { basename } from 'path';
import { toNumber } from './scoring.js';

export function loadManualRows(filePath) {
    const text = readFileSync(filePath, 'utf8');
    if (filePath.endsWith('.jsonl')) return parseJsonl(text);
    if (filePath.endsWith('.json')) return parseJson(text);
    return parseCsv(text);
}

function parseJson(text) {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed.map(normalizeManualRow) : [normalizeManualRow(parsed)];
}

function parseJsonl(text) {
    return text
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => normalizeManualRow(JSON.parse(line)));
}

function parseCsv(text) {
    const rows = parseCsvRows(text);
    if (rows.length === 0) return [];
    const headers = rows[0].map((header) => header.trim());
    return rows.slice(1)
        .filter((row) => row.some((value) => value.trim()))
        .map((row) => {
            const object = {};
            for (let i = 0; i < headers.length; i += 1) {
                object[headers[i]] = row[i] ?? '';
            }
            return normalizeManualRow(object);
        });
}

function parseCsvRows(text) {
    const rows = [];
    let row = [];
    let value = '';
    let quoted = false;

    for (let i = 0; i < text.length; i += 1) {
        const char = text[i];
        const next = text[i + 1];
        if (quoted) {
            if (char === '"' && next === '"') {
                value += '"';
                i += 1;
            } else if (char === '"') {
                quoted = false;
            } else {
                value += char;
            }
        } else if (char === '"') {
            quoted = true;
        } else if (char === ',') {
            row.push(value);
            value = '';
        } else if (char === '\n') {
            row.push(value);
            rows.push(row);
            row = [];
            value = '';
        } else if (char !== '\r') {
            value += char;
        }
    }
    row.push(value);
    rows.push(row);
    return rows;
}

export function normalizeManualRow(row) {
    const creator = pick(row, ['creator', 'creator_handle', 'username', 'handle']).replace(/^@/, '');
    const id = pick(row, ['id', 'video_id']);
    const url = pick(row, ['url', 'post_url', 'video_url']) || inferTikTokUrl({ creator, id });
    const postedAt = pick(row, ['posted_at', 'postedAt', 'create_time', 'date']);

    return {
        platform: 'tiktok',
        id,
        url,
        creator,
        caption: pick(row, ['caption', 'hook_text', 'description', 'video_description', 'concept_summary']),
        views: toNumber(pick(row, ['views', 'view_count'])),
        followers: toNumber(pick(row, ['followers', 'creator_followers', 'creator_follower_count', 'follower_count'])),
        likes: toNumber(pick(row, ['likes', 'like_count'])),
        comments: toNumber(pick(row, ['comments', 'comment_count'])),
        shares: toNumber(pick(row, ['shares', 'share_count'])),
        postedAt,
        postAgeDays: toNumber(pick(row, ['post_age_days', 'age_days']), null),
        durationSeconds: toNumber(pick(row, ['duration_seconds', 'video_duration']), null),
        conceptSummary: pick(row, ['concept_summary']),
        hookText: pick(row, ['hook_text']),
        source: pick(row, ['source']) || `manual:${basename(url || id || creator || 'row')}`,
    };
}

function pick(row, keys) {
    for (const key of keys) {
        if (row[key] !== undefined && row[key] !== null && row[key] !== '') return String(row[key]).trim();
    }
    return '';
}

function inferTikTokUrl({ creator, id }) {
    if (!creator || !id) return '';
    return `https://www.tiktok.com/@${creator}/video/${id}`;
}
