import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Uses an installed Playwright runtime (or one exposed through NODE_PATH).
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assets = path.join(root, "public/assets/website");
const cards = [
  {
    key: "home",
    template: "landing-page",
    label: "IDENTITY. ACTION. PROGRESS.",
    heading: "Who you’re becoming.<br><em>One day at a time.</em>",
    description: "Build a manageable plan.<br>Take the next small action.",
    footer: "Free to begin · iPhone & iPad",
    alt: "Resolution Companion: Who you’re becoming. One day at a time. A real app screen shows a reading habit and its two-minute alternative.",
  },
  {
    key: "release-notes",
    template: "release-notes",
    label: "PRODUCT UPDATES",
    heading: "Small improvements.<br><em>Steady progress.</em>",
    description: "See what’s new in<br>Resolution Companion.",
    footer: "Release notes",
    alt: "Resolution Companion release notes: Small improvements. Steady progress. Beside the text is the app’s plan review screen.",
  },
  {
    key: "support",
    template: "feedback",
    label: "SUPPORT & FEEDBACK",
    heading: "A little help.<br><em>A next step.</em>",
    description: "Find answers, get support,<br>or share an idea.",
    footer: "Here to help",
    alt: "Resolution Companion support and feedback: A little help. A next step. Beside the text is the app’s plan review screen.",
  },
  {
    key: "privacy",
    template: "privacy",
    label: "PRIVACY POLICY",
    heading: "Your information.<br><em>Clearly explained.</em>",
    description: "How your data is stored<br>and AI conversations are handled.",
    footer: "Privacy at Resolution Companion",
    alt: "Resolution Companion privacy policy: Your information. Clearly explained. Beside the text is the app’s plan review screen.",
  },
  {
    key: "terms",
    template: "terms",
    label: "TERMS OF USE",
    heading: "Using the app.<br><em>Know the terms.</em>",
    description: "The app, AI coaching,<br>and optional subscriptions.",
    footer: "Terms at Resolution Companion",
    alt: "Resolution Companion terms of use: Using the app. Know the terms. Beside the text is the app’s plan review screen.",
  },
];
const dataImage = async (name) =>
  `data:image/png;base64,${(await readFile(path.join(assets, name))).toString("base64")}`;
const logo = await dataImage("app-logo.png");
const screen = await dataImage("screen-plan-v5.png");
const escape = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  for (const card of cards) {
    await page.setContent(`<!doctype html><html lang="en"><meta charset="utf-8"><title>${card.key}</title><style>
      *{box-sizing:border-box}body{margin:0;width:1200px;height:630px;background:#dce7ed;color:#172c38;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}
      .brand{position:absolute;left:60px;top:42px;display:flex;align-items:center;gap:18px;font-size:29px;font-weight:700;letter-spacing:-.6px}
      .brand img{width:58px;height:58px;border:2px solid #007a91;border-radius:16px;padding:3px;background:#101316}
      .copy{position:absolute;left:60px;top:150px;width:730px}
      .label{font-size:16px;letter-spacing:2.3px;font-weight:700;color:#00687d;margin:0 0 23px}
      h1{font-size:65px;line-height:1.08;letter-spacing:-2.6px;margin:0 0 25px;max-width:735px}em{font-style:normal;color:#00687d}
      .description{font-size:27px;line-height:1.45;color:#405966;margin:0}
      .footer{position:absolute;left:60px;bottom:45px;font-size:20px;color:#405966;line-height:1.6}.footer strong{display:block;font-weight:650;color:#172c38}
      .stage{position:absolute;right:55px;top:44px;width:305px;height:542px;background:#f6f9fb;border:1px solid #bccfd9;border-radius:25px;display:flex;align-items:center;flex-direction:column;padding:20px 0}
      .stage-label{font-size:12px;letter-spacing:1.6px;color:#405966;font-weight:700;margin-bottom:16px}
      .phone{width:202px;border:5px solid #172126;border-radius:30px;overflow:hidden;box-shadow:0 14px 25px #172c3829;background:#000;flex-shrink:0}.phone img{display:block;width:100%;height:auto}
      .caption{font-size:13px;color:#52606b;margin-top:15px}
    </style><body><div class="brand"><img src="${logo}" alt="">Resolution Companion</div><main class="copy"><p class="label">${card.label}</p><h1>${card.heading}</h1><p class="description">${card.description}</p></main><div class="footer"><strong>${card.footer}</strong>resolutioncompanion.com</div><aside class="stage"><div class="stage-label">A PLAN THAT FITS YOUR DAY</div><div class="phone"><img src="${screen}" alt="App plan review"></div><div class="caption">Actual app screen · Sample data</div></aside></body></html>`);
    await page.evaluate(() =>
      Promise.all([...document.images].map((img) => img.decode())),
    );
    const fits = await page.evaluate(() => {
      const copy = document.querySelector(".copy").getBoundingClientRect();
      const stage = document.querySelector(".stage").getBoundingClientRect();
      const footer = document.querySelector(".footer").getBoundingClientRect();
      return (
        copy.right <= stage.left &&
        copy.bottom < footer.top &&
        document.body.scrollWidth === 1200 &&
        document.body.scrollHeight === 630
      );
    });
    if (!fits) throw new Error(`Card layout does not fit: ${card.key}`);
    const png = await page.screenshot();
    const hash = createHash("sha256").update(png).digest("hex").slice(0, 12);
    const filename = `social-${card.key}-${hash}.png`;
    await writeFile(path.join(assets, filename), png);
    const template = path.join(
      root,
      "server/templates",
      `${card.template}.html`,
    );
    let html = await readFile(template, "utf8");
    const content = (property) =>
      html.match(
        new RegExp(
          `<meta\\s+property="${property}"\\s+content="([^"]*)"\\s*/?>`,
        ),
      )[1];
    const title = content("og:title");
    const description = content("og:description");
    const url = `https://resolutioncompanion.com/assets/website/${filename}`;
    // Replace the entire image/Twitter family so every route has one consistent set.
    html = html.replace(
      /\s*<meta\s+(?:property="og:image(?::[^"]*)?"|name="twitter:[^"]+")[^>]*>/g,
      "",
    );
    const metadata = [
      ["property", "og:image", url],
      ["property", "og:image:type", "image/png"],
      ["property", "og:image:width", "1200"],
      ["property", "og:image:height", "630"],
      ["property", "og:image:alt", escape(card.alt)],
      ["name", "twitter:card", "summary_large_image"],
      ["name", "twitter:title", title],
      ["name", "twitter:description", description],
      ["name", "twitter:image", url],
      ["name", "twitter:image:alt", escape(card.alt)],
    ]
      .map(
        ([attr, name, value]) =>
          `    <meta ${attr}="${name}" content="${value}" />`,
      )
      .join("\n");
    html = html.replace(/(<meta\s+property="og:url"[^>]*>)/, `$1\n${metadata}`);
    await writeFile(template, html);
    console.log(
      `${card.key}: ${filename} (${Math.round(png.length / 1024)} KB)`,
    );
  }
} finally {
  await browser.close();
}
