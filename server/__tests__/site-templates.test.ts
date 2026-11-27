import crypto from "crypto";
import fs from "fs";
import path from "path";

const templates = path.resolve(process.cwd(), "server", "templates");
const read = (f: string) => fs.readFileSync(path.join(templates, f), "utf8");

test("no template hardcodes a copyright year", () => {
  for (const f of fs
    .readdirSync(templates)
    .filter((n) => n.endsWith(".html"))) {
    expect(read(f)).not.toMatch(/(?:©|&copy;)\s*20\d\d/);
  }
});

test("landing page names no specific app version in static copy", () => {
  expect(read("landing-page.html")).not.toMatch(/Version \d+\.\d+/);
});

test("1.6.0 is recorded as released on 2026-10-24", () => {
  const releases = JSON.parse(
    fs.readFileSync(
      path.resolve(process.cwd(), "public", "releases.json"),
      "utf8",
    ),
  );
  const r = releases.find((x: { version: string }) => x.version === "1.6.0");
  expect(r.status).toBe("released");
  expect(r.releasedAt).toBe("2026-10-24");
});

const publicDir = path.resolve(process.cwd(), "public");
const readPublic = (f: string) =>
  fs.readFileSync(path.join(publicDir, f), "utf8");
const squash = (text: string) => text.replace(/\s+/g, " ");
const templateNames = fs
  .readdirSync(templates)
  .filter((n) => n.endsWith(".html"));
const STEP_MESSAGE = "one small daily step to start";

test("every template has a skip link to #main-content and a matching target", () => {
  expect(templateNames).toContain("new-year.html");
  for (const f of templateNames) {
    const html = read(f);
    // Same shape scripts/check-accessibility.mjs requires.
    expect([
      f,
      /class="skip-link"[^>]*href="#main-content"/.test(html),
    ]).toEqual([f, true]);
    expect([f, /<main\b[^>]*id="main-content"/.test(html)]).toEqual([f, true]);
  }
  expect(readPublic("assets/website/site.css")).toMatch(/\.skip-link:focus/);
});

test('"mid-November" appears nowhere on the site', () => {
  const sources = [
    ...templateNames.map(read),
    readPublic("llms.txt"),
    readPublic("llms-full.txt"),
    readPublic("releases.json"),
  ];
  for (const text of sources) {
    expect(text).not.toMatch(/mid[- ]november/i);
  }
});

test("every template loads the shared script and stylesheets at their current hash", () => {
  const hash = (f: string) =>
    crypto
      .createHash("sha256")
      .update(fs.readFileSync(path.join(publicDir, "assets", "website", f)))
      .digest("hex")
      .slice(0, 12);
  for (const f of templateNames) {
    const html = read(f);
    for (const asset of ["site.css", "site.js", "site-premium.css"]) {
      expect([
        f,
        asset,
        html.includes(`/assets/website/${asset}?v=${hash(asset)}`),
      ]).toEqual([f, asset, true]);
    }
    expect([
      f,
      /<script src="\/assets\/website\/site\.js[^"]*" defer>/.test(html),
    ]).toEqual([f, true]);
  }
});

test("new-year lays its steps out in the shared grid and shows the plan screenshot", () => {
  const html = read("new-year.html");
  expect(html).toMatch(/class="steps-grid"/);
  expect(html.match(/class="step-card"/g)).toHaveLength(3);
  // Classes the shared stylesheets never defined.
  expect(html).not.toMatch(/class="(?:rule-label|step-number)"/);
  const img = html.match(/<img\b[^>]*screen-plan-v6\.png[^>]*>/);
  expect(img).not.toBeNull();
  expect(img![0]).toMatch(/alt="[^"]{20,}"/);
  expect(img![0]).toMatch(/width="1206"/);
  expect(img![0]).toMatch(/height="2622"/);
  // The menu script finds the button by class and the menu by id.
  expect(html).toMatch(/class="menu-toggle"[^>]*aria-controls="site-nav"/);
  expect(html).toMatch(/id="site-nav"/);
});

test("every local asset a template references exists", () => {
  for (const f of templateNames) {
    const refs = [
      ...read(f).matchAll(/(?:src|href|poster)="(\/assets\/[^"?#]+)/g),
    ];
    expect(refs.length).toBeGreaterThan(0);
    for (const [, ref] of refs) {
      expect([f, ref, fs.existsSync(path.join(publicDir, ref))]).toEqual([
        f,
        ref,
        true,
      ]);
    }
  }
});

test("the site says what the live app does: one small daily step to start", () => {
  const home = read("landing-page.html");
  const metaDescription = home.match(
    /<meta\s+name="description"\s+content="([^"]+)"/,
  );
  expect(metaDescription![1]).toContain(STEP_MESSAGE);
  const subhead = home.match(/class="hero-intro">([^<]*)</);
  expect(squash(subhead![1])).toContain(STEP_MESSAGE);
  const firstStep = home.match(/<span>01<\/span>[\s\S]*?<\/article>/);
  expect(squash(firstStep![0])).toContain(STEP_MESSAGE);
  const jsonLd = JSON.parse(
    home.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1],
  );
  const app = jsonLd["@graph"].find(
    (n: { "@type": string }) => n["@type"] === "MobileApplication",
  );
  expect(
    app.featureList.some((item: string) => item.includes(STEP_MESSAGE)),
  ).toBe(true);
  expect(squash(read("new-year.html"))).toContain(STEP_MESSAGE);
  expect(readPublic("llms.txt")).toContain(STEP_MESSAGE);
});

test("support page answers the goal-but-not-the-steps question in the page and its FAQ data", () => {
  const html = read("feedback.html");
  const jsonLd = JSON.parse(
    html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1],
  );
  const faq = jsonLd["@graph"].find(
    (n: { "@type": string }) => n["@type"] === "FAQPage",
  );
  const entry = faq.mainEntity.find((q: { name: string }) =>
    /steps/i.test(q.name),
  );
  expect(entry).toBeDefined();
  expect(entry.acceptedAnswer.text).toContain(STEP_MESSAGE);
  const visible = html.match(
    /<summary>\s*([^<]*steps[^<]*?)\s*<\/summary>\s*<p>([\s\S]*?)<\/p>/i,
  );
  expect(visible).not.toBeNull();
  expect(squash(visible![1])).toBe(entry.name);
  expect(squash(visible![2])).toContain(STEP_MESSAGE);
});

test("site copy promises nothing the live app does not do yet", () => {
  // The promise headline waits for the free look-back (Track E).
  expect(squash(read("landing-page.html"))).toContain(
    '<h1 id="hero-title"> Who you\'re<br />becoming.<br /><span>One day at a time.</span> </h1>',
  );
  const sources = [
    ...templateNames.map(read),
    readPublic("llms.txt"),
    readPublic("llms-full.txt"),
  ];
  for (const text of sources) {
    expect(text).not.toMatch(/full plan|roadmap/i);
    expect(text).not.toMatch(/resolution,\s+kept/i);
    expect(text).not.toMatch(/proof you can look back on/i);
  }
});

test("no template or product brief uses an em dash", () => {
  for (const f of templateNames) {
    expect([f, read(f).includes("—")]).toEqual([f, false]);
  }
  expect(readPublic("llms.txt")).not.toContain("—");
  expect(readPublic("llms-full.txt")).not.toContain("—");
});

test("the product brief lists the same tiers as the home page", () => {
  const home = read("landing-page.html");
  const brief = readPublic("llms-full.txt");
  const cards = [
    ...home.matchAll(/<article class="price-card[^"]*">([\s\S]*?)<\/article>/g),
  ];
  expect(cards).toHaveLength(2);
  for (const [, card] of cards) {
    const items = [...card.matchAll(/<li>([^<]+)<\/li>/g)].map((m) =>
      squash(m[1]).trim(),
    );
    expect(items.length).toBeGreaterThan(2);
    for (const item of items) {
      expect(brief).toContain(`- ${item}`);
    }
  }
});
