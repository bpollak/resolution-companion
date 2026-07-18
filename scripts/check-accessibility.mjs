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

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(
  "Accessibility static checks passed: orientation, control names, roles, states, form labels, and modal isolation.",
);
