const fs = require('fs/promises');

const API_KEY = process.env.STEAM_WEB_API_KEY;
const CARD_CATEGORY_ID = 29;

if (!API_KEY) {
  throw new Error('Missing STEAM_WEB_API_KEY');
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${url}`);
  }
  return res.json();
}

async function getSteamApps() {
  const apps = [];
  let lastAppid = 0;

  while (true) {
    const input = {
      include_games: true,
      max_results: 50000,
    };

    if (lastAppid) {
      input.last_appid = lastAppid;
    }

    const url =
      `https://partner.steam-api.com/IStoreService/GetAppList/v1/` +
      `?key=${API_KEY}&input_json=${encodeURIComponent(JSON.stringify(input))}`;

    const data = await fetchJson(url);
    const page = data.response?.apps || [];

    if (page.length === 0) break;

    apps.push(...page);
    lastAppid = page[page.length - 1].appid;

    console.log(`Loaded ${apps.length} apps, last appid: ${lastAppid}`);

    if (page.length < 50000) break;
    await sleep(1000);
  }

  return apps.map((app) => app.appid);
}

async function getAppsWithCards(appids) {
  const cardApps = [];
  const chunkSize = 50;

  for (let i = 0; i < appids.length; i += chunkSize) {
    const chunk = appids.slice(i, i + chunkSize);
    const url =
      `https://store.steampowered.com/api/appdetails` +
      `?appids=${chunk.join(',')}&filters=categories&l=english`;

    const data = await fetchJson(url);

    for (const appid of chunk) {
      const item = data[String(appid)];
      const categories = item?.data?.categories || [];

      if (categories.some((category) => category.id === CARD_CATEGORY_ID)) {
        cardApps.push(appid);
      }
    }

    console.log(`Checked ${Math.min(i + chunkSize, appids.length)} / ${appids.length}`);
    await sleep(1200);
  }

  return cardApps.sort((a, b) => a - b);
}

async function main() {
  await fs.mkdir('data', { recursive: true });

  const appids = await getSteamApps();
  const cardApps = await getAppsWithCards(appids);

  await fs.writeFile('data/cards.json', JSON.stringify(cardApps, null, 2) + '\n');

  await fs.writeFile(
    'data/meta.json',
    JSON.stringify(
      {
        updatedAt: new Date().toISOString(),
        totalGamesChecked: appids.length,
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
