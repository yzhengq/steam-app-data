const fs = require('fs/promises');

const SEARCH_COUNT = 50;
const PAGE_DELAY_MS = 3500;
const MAX_RETRY_DELAY_MS = 120000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url, attempt = 1) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 steam-app-data-builder',
      Accept: 'application/json,text/javascript,*/*',
    },
  });

  if (res.status === 429) {
    const waitMs = Math.min(MAX_RETRY_DELAY_MS, 10000 * attempt);
    console.log(`HTTP 429 rate limited. Waiting ${waitMs / 1000}s before retry ${attempt}...`);
    await sleep(waitMs);
    return fetchJson(url, attempt + 1);
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${url}`);
  }

  return res.json();
}

function extractAppids(html) {
  const appids = new Set();

  for (const match of html.matchAll(/data-ds-appid="(\d+)"/g)) {
    appids.add(Number(match[1]));
  }

  for (const match of html.matchAll(/\/app\/(\d+)\//g)) {
    appids.add(Number(match[1]));
  }

  return [...appids].filter((appid) => Number.isInteger(appid) && appid > 0);
}

function parseTotalCount(value) {
  const text = String(value ?? '');
  const digits = text.replace(/[^\d]/g, '');
  return digits ? Number(digits) : 0;
}

function buildSearchUrl({ start, count, category1, category2 }) {
  const params = new URLSearchParams({
    query: '',
    start: String(start),
    count: String(count),
    dynamic_data: '',
    sort_by: '_ASC',
    ignore_preferences: '1',
    force_infinite: '1',
    infinite: '1',
  });

  if (category1) {
    params.set('category1', String(category1));
  }
  if (category2) {
    params.set('category2', String(category2));
  }

  return `https://store.steampowered.com/search/results/?${params.toString()}`;
}

async function fetchSearchAppids(source) {
  const appids = new Set();
  let start = 0;
  let totalCount = Infinity;

  while (start < totalCount) {
    const url = buildSearchUrl({
      start,
      count: SEARCH_COUNT,
      category1: source.category1,
      category2: source.category2,
    });

    const data = await fetchJson(url);
    const pageAppids = extractAppids(data.results_html || '');

    for (const appid of pageAppids) {
      appids.add(appid);
    }

    totalCount = parseTotalCount(data.total_count);
    start += SEARCH_COUNT;

    console.log(
      `[${source.name}] loaded ${appids.size} appids, page start: ${start}, total: ${totalCount}`
    );

    if (pageAppids.length === 0) {
      break;
    }

    await sleep(PAGE_DELAY_MS);
  }

  return [...appids].sort((a, b) => a - b);
}

async function buildMergedList(name, sources) {
  const merged = new Set();

  for (const source of sources) {
    const appids = await fetchSearchAppids({ ...source, name });
    for (const appid of appids) {
      merged.add(appid);
    }
  }

  return [...merged].sort((a, b) => a - b);
}

async function writeJson(path, data) {
  await fs.writeFile(path, JSON.stringify(data, null, 2) + '\n');
}

async function main() {
  await fs.mkdir('data', { recursive: true });

  const cards = await buildMergedList('cards', [
    {
      label: 'Steam Trading Cards',
      category1: 998,
      category2: 29,
    },
  ]);

  const restricted = await buildMergedList('restricted', [
    {
      label: 'Profile Features Limited',
      category1: 998,
      category2: 1003823,
    },
  ]);

  const nogame = await buildMergedList('nogame', [
    {
      label: 'DLC',
      category1: 21,
    },
    {
      label: 'Soundtrack',
      category2: 50,
    },
  ]);

  await writeJson('data/cards.json', cards);
  await writeJson('data/restricted.json', restricted);
  await writeJson('data/nogame.json', nogame);
  await writeJson('data/meta.json', {
    updatedAt: new Date().toISOString(),
    source: 'Steam Store search results',
    counts: {
      cards: cards.length,
      restricted: restricted.length,
      nogame: nogame.length,
    },
    categories: {
      cards: ['category1=998', 'category2=29'],
      restricted: ['category1=998', 'category2=1003823'],
      nogame: ['category1=21', 'category2=50'],
    },
  });

  console.log(
    `Done. cards=${cards.length}, restricted=${restricted.length}, nogame=${nogame.length}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
