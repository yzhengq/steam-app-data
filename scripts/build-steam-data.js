const fs = require('fs/promises');

const SEARCH_COUNT = 50;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 steam-app-data-builder',
      Accept: 'application/json,text/javascript,*/*',
    },
  });

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

async function getAppsWithCards() {
  const cardApps = new Set();
  let start = 0;
  let totalCount = Infinity;

  while (start < totalCount) {
    const url =
      'https://store.steampowered.com/search/results/' +
      `?query=&start=${start}&count=${SEARCH_COUNT}` +
      '&dynamic_data=&sort_by=_ASC&category1=998&category2=29' +
      '&ignore_preferences=1&force_infinite=1&infinite=1';

    const data = await fetchJson(url);
    const html = data.results_html || '';
    const appids = extractAppids(html);

    for (const appid of appids) {
      cardApps.add(appid);
    }

    totalCount = parseTotalCount(data.total_count);
    start += SEARCH_COUNT;

    console.log(`Loaded ${cardApps.size} card apps, page start: ${start}, total: ${totalCount}`);

    if (appids.length === 0) {
      break;
    }

    await sleep(1200);
  }

  return [...cardApps].sort((a, b) => a - b);
}

async function main() {
  await fs.mkdir('data', { recursive: true });

  const cardApps = await getAppsWithCards();

  await fs.writeFile(
    'data/cards.json',
    JSON.stringify(cardApps, null, 2) + '\n'
  );

  await fs.writeFile(
    'data/meta.json',
    JSON.stringify(
      {
        updatedAt: new Date().toISOString(),
        source: 'Steam Store search category2=29',
        cardsCount: cardApps.length,
      },
      null,
      2
    ) + '\n'
  );

  console.log(`Done. Found ${cardApps.length} apps with trading cards.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
