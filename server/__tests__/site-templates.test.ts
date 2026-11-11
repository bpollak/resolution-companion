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
