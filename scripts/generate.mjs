import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_URL =
  process.env.BINDAY_URL ||
  "https://secure.derby.gov.uk/binday/BinDays/100030350384?address=117%20Radbourne%20Street,%20Derby,%20DE22%203BW";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const docsDir = path.join(projectRoot, "docs");
const dataPath = path.join(docsDir, "current.json");
const htmlPath = path.join(docsDir, "index.html");

function decodeHtml(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseDisplayDate(text) {
  const match = text.match(/^[A-Za-z]+,\s+(\d{2})\s+([A-Za-z]+)\s+(\d{4})$/);

  if (!match) {
    throw new Error(`Unsupported date format: ${text}`);
  }

  const [, day, monthName, year] = match;
  const month = new Date(`${monthName} 1, ${year} UTC`).getUTCMonth() + 1;

  if (!month) {
    throw new Error(`Unsupported month name: ${monthName}`);
  }

  return `${year}-${String(month).padStart(2, "0")}-${day}`;
}

function formatDateForHumans(isoDate) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

function slugifyBin(label) {
  const value = label.toLowerCase();

  if (value.includes("recycling")) {
    return "recycling";
  }

  if (value.includes("general waste")) {
    return "general-waste";
  }

  if (value.includes("garden")) {
    return "garden";
  }

  if (value.includes("food")) {
    return "food";
  }

  return value.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function parseBinPage(html, sourceUrl) {
  const addressMatch = html.match(
    /<h1>\s*Bin collection details for:\s*([^<]+?)\s*<\/h1>/i
  );

  if (!addressMatch) {
    throw new Error("Could not find the address heading on the page.");
  }

  const address = decodeHtml(addressMatch[1].trim());
  const results = [];
  const resultPattern =
    /<div class="binresult">[\s\S]*?<img[^>]+src="([^"]+)"[^>]+alt="([^"]+)"[\s\S]*?<p><strong>([^<]+):<\/strong>\s*([^<]+)<\/p>[\s\S]*?<\/div>/gi;

  let match;

  while ((match = resultPattern.exec(html)) !== null) {
    const imageUrl = new URL(match[1], sourceUrl).toString();
    const iconAlt = decodeHtml(match[2].trim());
    const displayDate = decodeHtml(match[3].trim());
    const label = decodeHtml(match[4].trim());

    results.push({
      isoDate: parseDisplayDate(displayDate),
      displayDate,
      label,
      iconAlt,
      imageUrl,
      type: slugifyBin(label)
    });
  }

  if (results.length === 0) {
    throw new Error("Could not find any collection entries on the page.");
  }

  const nextDate = results.reduce(
    (earliest, entry) => (entry.isoDate < earliest ? entry.isoDate : earliest),
    results[0].isoDate
  );

  return {
    sourceUrl,
    address,
    fetchedAt: new Date().toISOString(),
    nextDate,
    nextDateLabel: formatDateForHumans(nextDate),
    bins: results.filter((entry) => entry.isoDate === nextDate)
  };
}

function renderHtml(data) {
  const binCards = data.bins
    .map(
      (bin) => `
        <article class="bin-card bin-card--${escapeHtml(bin.type)}">
          <img src="${escapeHtml(bin.imageUrl)}" alt="${escapeHtml(bin.iconAlt)}" />
          <h2>${escapeHtml(bin.label)}</h2>
        </article>
      `
    )
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Next bin day</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #eef3e8;
        --panel: rgba(255, 255, 255, 0.82);
        --text: #1f2c1d;
        --muted: #5a6f56;
        --ring: rgba(31, 44, 29, 0.08);
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        font-family: "Barlow", "Segoe UI", sans-serif;
        background:
          radial-gradient(circle at top left, rgba(113, 161, 83, 0.18), transparent 30%),
          linear-gradient(135deg, #f4f8f0 0%, #e5eedc 100%);
        color: var(--text);
      }

      main {
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
      }

      .panel {
        width: min(980px, 100%);
        background: var(--panel);
        border: 1px solid var(--ring);
        border-radius: 28px;
        box-shadow: 0 24px 80px rgba(44, 63, 34, 0.12);
        overflow: hidden;
        backdrop-filter: blur(10px);
      }

      .hero {
        padding: 32px 32px 20px;
      }

      .eyebrow {
        margin: 0 0 8px;
        color: var(--muted);
        font-size: 0.95rem;
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      h1 {
        margin: 0;
        font-size: clamp(2.2rem, 5vw, 4.5rem);
        line-height: 0.95;
      }

      .subhead {
        margin: 14px 0 0;
        color: var(--muted);
        font-size: clamp(1rem, 1.6vw, 1.15rem);
      }

      .bins {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 18px;
        padding: 0 32px 32px;
      }

      .bin-card {
        display: grid;
        justify-items: center;
        text-align: center;
        gap: 12px;
        padding: 22px 16px;
        background: rgba(255, 255, 255, 0.72);
        border-radius: 22px;
        border: 1px solid rgba(31, 44, 29, 0.08);
      }

      .bin-card img {
        width: 112px;
        height: 112px;
        object-fit: contain;
      }

      .bin-card h2 {
        margin: 0;
        font-size: 1.15rem;
        line-height: 1.2;
      }

      footer {
        padding: 0 32px 24px;
        color: var(--muted);
        font-size: 0.9rem;
      }

      @media (max-width: 640px) {
        .hero {
          padding: 24px 24px 12px;
        }

        .bins {
          padding: 0 24px 24px;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        footer {
          padding: 0 24px 24px;
        }
      }
    </style>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;600;700&display=swap" rel="stylesheet" />
  </head>
  <body>
    <main>
      <section class="panel">
        <header class="hero">
          <p class="eyebrow">Next collection</p>
          <h1>${escapeHtml(data.nextDateLabel)}</h1>
          <p class="subhead">${escapeHtml(data.address)}</p>
        </header>
        <section class="bins">
          ${binCards}
        </section>
        <footer>
          Updated ${escapeHtml(new Date(data.fetchedAt).toLocaleString("en-GB", { timeZone: "UTC" }))} UTC
        </footer>
      </section>
    </main>
  </body>
</html>`;
}

async function fetchSource(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "bin-day-static-site/0.1"
    }
  });

  if (!response.ok) {
    throw new Error(`Source request failed with status ${response.status}`);
  }

  return response.text();
}

async function writeOutput(data) {
  await mkdir(docsDir, { recursive: true });
  await writeFile(dataPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await writeFile(htmlPath, renderHtml(data), "utf8");
}

async function loadPreviousData() {
  try {
    return JSON.parse(await readFile(dataPath, "utf8"));
  } catch {
    return null;
  }
}

async function main() {
  try {
    const html = await fetchSource(SOURCE_URL);
    const data = parseBinPage(html, SOURCE_URL);
    await writeOutput(data);
    console.log(`Generated ${htmlPath} for ${data.nextDate} (${data.bins.length} bins).`);
  } catch (error) {
    const previous = await loadPreviousData();

    if (!previous) {
      throw error;
    }

    console.warn(`Refresh failed, keeping previous output: ${error.message}`);
    await writeOutput(previous);
  }
}

await main();
