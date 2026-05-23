const fs = require('fs/promises');

const CARD_CATEGORY_ID = 29;


const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${url}`);
  }
  return res.json();
}

async function getSteamApps() {
  const url = 'https://api.steampowered.com/ISteamApps/GetAppList/v2/';
  const data = await fetchJson(url);
  const apps = data.applist?.apps || [];

  console.log(`Loaded ${apps.length} apps from public Steam app list`);

  return apps
    .map((app) => Number(app.appid))
    .filter((appid) => Number.isInteger(appid) && appid > 0)
    .sort((a, b) => a - b);
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
