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
        --page-pad: clamp(2px, 0.6vmin, 8px);
        --section-pad: clamp(12px, 1.8vmin, 24px);
        --card-pad-y: clamp(12px, 2vmin, 22px);
        --card-pad-x: clamp(10px, 1.8vmin, 16px);
        --gap: clamp(10px, 1.8vmin, 18px);
        --img-size: clamp(64px, 11vmin, 112px);
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        margin: 0;
        height: 100%;
        font-family: "Barlow", "Segoe UI", sans-serif;
        background:
          radial-gradient(circle at top left, rgba(113, 161, 83, 0.18), transparent 30%),
          linear-gradient(135deg, #f4f8f0 0%, #e5eedc 100%);
        color: var(--text);
        overflow: hidden;
      }

      body.compact {
        --page-pad: 0px;
        --section-pad: clamp(8px, 1.2vmin, 14px);
        --card-pad-y: clamp(8px, 1.1vmin, 12px);
        --card-pad-x: clamp(8px, 1.1vmin, 12px);
        --gap: clamp(8px, 1.2vmin, 14px);
        --img-size: clamp(120px, 18vmin, 220px);
        background: #f5f8ef;
      }

      main {
        height: 100dvh;
        display: grid;
        place-items: center;
        padding: var(--page-pad);
      }

      .panel {
        width: 100%;
        max-height: calc(100dvh - (var(--page-pad) * 2));
        background: var(--panel);
        border-radius: clamp(18px, 3vmin, 28px);
        box-shadow: 0 24px 80px rgba(44, 63, 34, 0.12);
        overflow: hidden;
        backdrop-filter: blur(10px);
        display: grid;
        grid-template-rows: auto 1fr auto;
      }

      .hero {
        padding: var(--section-pad) var(--section-pad) clamp(10px, 1.6vmin, 20px);
      }

      .eyebrow {
        margin: 0 0 8px;
        color: var(--muted);
        font-size: clamp(0.75rem, 1.6vmin, 0.95rem);
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }

      h1 {
        margin: 0;
        font-size: clamp(1.7rem, 5.2vmin, 4.5rem);
        line-height: 0.95;
      }

      .subhead {
        margin: 14px 0 0;
        color: var(--muted);
        font-size: clamp(0.82rem, 1.9vmin, 1.15rem);
      }

      .bins {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(140px, 100%), 1fr));
        gap: var(--gap);
        padding: 0 var(--section-pad) var(--section-pad);
        align-content: center;
      }

      .bin-card {
        display: grid;
        justify-items: center;
        text-align: center;
        gap: clamp(8px, 1.4vmin, 12px);
        padding: var(--card-pad-y) var(--card-pad-x);
        background: rgba(255, 255, 255, 0.72);
        border-radius: clamp(16px, 2.4vmin, 22px);
        box-shadow: inset 0 0 0 1px rgba(31, 44, 29, 0.04);
        min-width: 0;
      }

      .bin-card img {
        width: var(--img-size);
        height: var(--img-size);
        object-fit: contain;
      }

      .bin-card h2 {
        margin: 0;
        font-size: clamp(0.85rem, 2vmin, 1.15rem);
        line-height: 1.2;
      }

      footer {
        padding: 0 var(--section-pad) var(--section-pad);
        color: var(--muted);
        font-size: clamp(0.7rem, 1.5vmin, 0.9rem);
      }

      @media (min-aspect-ratio: 14/9) {
        .panel {
          height: calc(100dvh - (var(--page-pad) * 2));
        }

        .bins {
          height: 100%;
          align-content: stretch;
        }

        .bin-card {
          height: 100%;
        }
      }

      body.compact .panel {
        width: 100%;
        height: 100dvh;
        max-height: 100dvh;
        grid-template-rows: auto 1fr;
        border-radius: 0;
        border: 0;
        box-shadow: none;
        backdrop-filter: none;
      }

      body.compact .hero {
        padding-top: clamp(10px, 1.6vmin, 16px);
        padding-bottom: clamp(4px, 0.8vmin, 8px);
      }

      body.compact .eyebrow {
        margin-bottom: 4px;
        font-size: clamp(0.8rem, 1.2vmin, 0.95rem);
      }

      body.compact h1 {
        font-size: clamp(2rem, 4.8vmin, 3.8rem);
      }

      body.compact .subhead {
        margin-top: 4px;
        font-size: clamp(0.95rem, 1.7vmin, 1.15rem);
      }

      body.compact .bins {
        grid-template-columns: repeat(${Math.min(Math.max(data.bins.length, 1), 4)}, minmax(0, 1fr));
        align-content: stretch;
        padding-top: clamp(4px, 0.8vmin, 8px);
        height: 100%;
      }

      body.compact .bin-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        border-radius: clamp(10px, 1.4vmin, 16px);
        gap: clamp(12px, 2vmin, 22px);
      }

      body.compact .bin-card h2 {
        font-size: clamp(1.2rem, 2.1vmin, 1.8rem);
        max-width: 18ch;
      }

      body.compact footer {
        display: none;
      }

      @media (max-width: 760px) {
        .bins {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      @media (max-width: 460px) {
        .bins {
          grid-template-columns: 1fr;
        }
      }

      @media (max-height: 900px) {
        .subhead {
          margin-top: 10px;
        }
      }

      @media (max-height: 760px) {
        .bins {
          grid-template-columns: repeat(${Math.min(Math.max(data.bins.length, 1), 3)}, minmax(0, 1fr));
        }
      }

      @media (max-height: 620px) {
        .eyebrow {
          margin-bottom: 4px;
        }

        .subhead {
          margin-top: 8px;
        }
      }

      @media (max-aspect-ratio: 16/9) {
        body.compact .bins {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      @media (max-height: 700px) {
        body.compact {
          --img-size: clamp(88px, 14vmin, 140px);
        }

        body.compact h1 {
          font-size: clamp(1.6rem, 4vmin, 3rem);
        }

        body.compact .subhead {
          font-size: clamp(0.82rem, 1.35vmin, 1rem);
        }

        body.compact .bin-card h2 {
          font-size: clamp(0.95rem, 1.7vmin, 1.2rem);
        }
      }

      body.compact main {
        place-items: stretch;
        padding: 0;
      }

      body.compact .hero,
      body.compact .bins {
        width: 100%;
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
    <script>
      const params = new URLSearchParams(window.location.search);
      if (params.get("compact") === "1") {
        document.body.classList.add("compact");
      }
    </script>
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
