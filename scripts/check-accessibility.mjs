import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const repoRoot = process.cwd();
const clientRoot = path.join(repoRoot, "client");
const failures = [];

const appConfig = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "app.json"), "utf8"),
);
if (appConfig.expo?.orientation !== "default") {
  failures.push(
    "app.json: expo.orientation must be default so content is not restricted to one display orientation",
  );
}

function collectTsxFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectTsxFiles(entryPath);
    return entry.isFile() && entry.name.endsWith(".tsx") ? [entryPath] : [];
  });
}

function elementName(node) {
  return ts.isIdentifier(node.tagName) ? node.tagName.text : undefined;
}

function attributeNames(node) {
  return new Set(
    node.attributes.properties
      .filter(ts.isJsxAttribute)
      .map((attribute) => attribute.name.text),
  );
}

const requirements = {
  Pressable: ["accessibilityRole", "accessibilityLabel"],
  AnimatedPressable: ["accessibilityRole", "accessibilityLabel"],
  TextInput: ["accessibilityLabel"],
  Switch: ["accessibilityRole", "accessibilityLabel", "accessibilityState"],
  Modal: ["accessibilityViewIsModal"],
};

for (const file of collectTsxFiles(clientRoot)) {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const name = elementName(node);
      const required = name ? requirements[name] : undefined;
      if (required) {
        const attributes = attributeNames(node);
        const missing = required.filter((item) => !attributes.has(item));
        if (missing.length > 0) {
          const { line } = source.getLineAndCharacterOfPosition(
            node.getStart(),
          );
          failures.push(
            `${path.relative(repoRoot, file)}:${line + 1}: ${name} missing ${missing.join(", ")}`,
          );
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
}

const websiteTemplates = [
  "landing-page.html",
  "release-notes.html",
  "feedback.html",
  "privacy.html",
  "terms.html",
];

for (const templateName of websiteTemplates) {
  const relativePath = path.join("server", "templates", templateName);
  const template = fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

  if (!/<main\b/i.test(template)) {
    failures.push(`${relativePath}: missing a main landmark`);
  }
  if (!/<nav\b[^>]*aria-label=/i.test(template)) {
    failures.push(`${relativePath}: primary navigation needs an aria-label`);
  }
  if (!/class="skip-link"[^>]*href="#main-content"/i.test(template)) {
    failures.push(`${relativePath}: missing a skip link to #main-content`);
  }
  if (/href="\/#feedback"/i.test(template)) {
    failures.push(
      `${relativePath}: links to the nonexistent /#feedback anchor`,
    );
  }

  const menuButtons = template.match(/<button\b[^>]*>/gi) || [];
  for (const button of menuButtons) {
    if (
      /class="[^"]*(?:mobile-menu-btn|mobile-nav-close)[^"]*"/i.test(button) &&
      !/aria-label=/i.test(button)
    ) {
      failures.push(`${relativePath}: mobile navigation button needs a label`);
    }
    if (
      /class="[^"]*mobile-menu-btn[^"]*"/i.test(button) &&
      (!/aria-controls="mobileNav"/i.test(button) ||
        !/aria-expanded="false"/i.test(button))
    ) {
      failures.push(
        `${relativePath}: mobile menu trigger needs controls and expanded state`,
      );
    }
  }

  if (
    /class="[^"]*mobile-nav[^"]*"/i.test(template) &&
    !/<div\b[^>]*class="[^"]*mobile-nav[^"]*"[^>]*aria-hidden="true"/i.test(
      template,
    )
  ) {
    failures.push(`${relativePath}: mobile navigation needs a hidden state`);
  }
}

const landingPage = fs.readFileSync(
  path.join(repoRoot, "server", "templates", "landing-page.html"),
  "utf8",
);
if (/<(?:ul|li) class="release-(?:grid|item)/i.test(landingPage)) {
  failures.push(
    "server/templates/landing-page.html: detailed release highlights must stay on /release-notes",
  );
}
const demoVideo = landingPage.match(
  /<video\b[^>]*poster="\/assets\/website\/app-demo-vertical-poster\.jpg"[^>]*>/i,
)?.[0];
if (
  !demoVideo ||
  /\bautoplay\b/i.test(demoVideo) ||
  !/preload="none"/i.test(demoVideo)
) {
  failures.push(
    "server/templates/landing-page.html: product demo must be user-initiated and preload none",
  );
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(
  "Accessibility static checks passed: app controls, website landmarks, navigation labels, skip links, and motion-sensitive media.",
);
