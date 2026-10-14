#!/usr/bin/env node
// Reports React Compiler bailouts. A component the compiler skips loses all
// automatic memoization, which is how Today, Journey, Profile, Coach, and
// AppProvider ended up re-rendering in full on every check-off. Exits non-zero
// when a file outside KNOWN_BAILOUTS has one, so fixed files stay fixed.
//
// Usage: node scripts/check-react-compiler.mjs [dir-or-file ...]
// Defaults to client/screens and client/context.

import { createRequire } from "node:module";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const babel = require("@babel/core");
const reactCompiler = require.resolve("babel-plugin-react-compiler");

// Bailouts that predate this check. Remove an entry once its file compiles;
// the check reports when that happens.
const KNOWN_BAILOUTS = new Set([
  "client/screens/ActionEditorScreen.tsx",
  "client/screens/BenchmarkEditorScreen.tsx",
  "client/screens/DataBackupScreen.tsx",
  "client/screens/MonthRecapScreen.tsx",
  "client/screens/OnboardingScreen.tsx",
  "client/screens/SubscriptionScreen.tsx",
]);

const FAILURE_KINDS = new Set([
  "CompileError",
  "CompileDiagnostic",
  "PipelineError",
]);

function collect(target) {
  const full = path.resolve(root, target);
  if (statSync(full).isFile()) return [full];
  return readdirSync(full, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "__tests__" || entry.name.startsWith(".")) return [];
    const child = path.join(full, entry.name);
    if (entry.isDirectory()) return collect(child);
    return /\.(tsx|ts|jsx|js)$/.test(entry.name) ? [child] : [];
  });
}

function describe(event) {
  const detail = event.detail ?? {};
  const options = detail.options ?? detail;
  const reason = options.reason ?? detail.message ?? "unknown reason";
  const loc =
    options.loc ?? options.details?.find((d) => d.loc)?.loc ?? event.fnLoc;
  const line = loc?.start?.line;
  return `${reason}${line ? ` (line ${line})` : ""}`;
}

const targets = process.argv.slice(2);
const files = (
  targets.length ? targets : ["client/screens", "client/context"]
).flatMap(collect);

let failures = 0;
for (const file of files) {
  const rel = path.relative(root, file).split(path.sep).join("/");
  const bailouts = [];
  babel.transformFileSync(file, {
    babelrc: false,
    configFile: false,
    code: false,
    parserOpts: { plugins: ["typescript", "jsx"] },
    // Mirrors babel-preset-expo's compiler options for production builds
    plugins: [
      [
        reactCompiler,
        {
          target: "19",
          panicThreshold: "none",
          logger: {
            logEvent(_filename, event) {
              if (FAILURE_KINDS.has(event.kind)) bailouts.push(event);
            },
          },
        },
      ],
    ],
  });

  const known = KNOWN_BAILOUTS.has(rel);
  if (bailouts.length === 0) {
    if (known)
      console.log(`${rel}: now compiles; remove it from KNOWN_BAILOUTS`);
    continue;
  }
  for (const event of bailouts) {
    console.log(
      `${known ? "known" : "BAILOUT"} ${rel}: ${event.fnName ? `${event.fnName}: ` : ""}${describe(event)}`,
    );
  }
  if (!known) failures += bailouts.length;
}

if (failures > 0) {
  console.error(
    `\n${failures} React Compiler bailout(s) in guarded files. Move try/finally and throw into module helpers, write refs in effects, and keep manual memo deps to plain identifiers.`,
  );
  process.exit(1);
}
console.log(
  `React Compiler: no bailouts in guarded files (${files.length} checked).`,
);
