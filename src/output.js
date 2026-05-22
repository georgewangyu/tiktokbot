function valueOrDash(value) {
    if (value === null || value === undefined || value === '') return '-';
    if (typeof value === 'number') return value.toLocaleString();
    return String(value);
}

function truncate(value, width) {
    const text = valueOrDash(value);
    if (text.length <= width) return text;
    return `${text.slice(0, Math.max(0, width - 3))}...`;
}

export function printResults(results, format = 'table') {
    if (format === 'json') {
        console.log(JSON.stringify(results, null, 2));
        return;
    }
    if (format === 'jsonl') {
        for (const result of results) {
            console.log(JSON.stringify(result));
        }
        return;
    }
    printTable(results);
}

function printTable(results) {
    if (results.length === 0) {
        console.log('No matching TikTok breakouts found.');
        return;
    }

    const rows = results.map((result, index) => ({
        '#': index + 1,
        score: result.score,
        outlier: result.outlierScore ?? '-',
        vpf: result.viewsPerFollower ?? '-',
        views: result.views,
        followers: result.followers,
        creator: result.creator,
        caption: result.caption,
        url: result.url,
    }));

    const columns = [
        ['#', 3],
        ['score', 8],
        ['outlier', 8],
        ['vpf', 8],
        ['views', 11],
        ['followers', 10],
        ['creator', 20],
        ['caption', 48],
        ['url', 48],
    ];

    const header = columns.map(([key, width]) => truncate(key, width).padEnd(width)).join('  ');
    console.log(header);
    console.log(columns.map(([, width]) => '-'.repeat(width)).join('  '));

    for (const row of rows) {
        console.log(columns.map(([key, width]) => truncate(row[key], width).padEnd(width)).join('  '));
    }
}
