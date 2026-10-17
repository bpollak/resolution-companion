import fs from "fs";
import path from "path";

// Brett's copy rule: no em dashes in anything a person reads. Comments are
// fine; the paywall table's "not included" cell is a lone glyph, not prose.
const ROOTS = ["screens", "components", "lib", "navigation"].map((dir) =>
  path.join(__dirname, "..", "..", dir),
);

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory())
      return entry.name === "__tests__" ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

describe("user-facing copy", () => {
  it("has no em dashes outside comments", () => {
    const offenders: string[] = [];
    // lib/copy.ts is the em-dash cleaner itself and has to match the glyph.
    for (const file of ROOTS.flatMap(sourceFiles).filter(
      (file) => !file.endsWith(path.join("lib", "copy.ts")),
    )) {
      fs.readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, index) => {
          const code = line.trim();
          if (!code.includes("—") && !/&mdash;|\\u2014/.test(code)) return;
          if (/^(\/\/|\*|\/\*|\{\/\*)/.test(code)) return;
          if (/\/\/.*—/.test(code) && !/["'`][^"'`]*—/.test(code)) return;
          if (/free="—"/.test(code)) return;
          offenders.push(`${path.relative(process.cwd(), file)}:${index + 1}`);
        });
    }
    expect(offenders).toEqual([]);
  });
});
