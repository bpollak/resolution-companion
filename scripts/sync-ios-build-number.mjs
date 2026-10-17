import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const appJsonPath = path.join(root, "app.json");
const output = execFileSync(
  "npx",
  ["eas-cli", "build:version:get", "--platform", "ios", "--non-interactive"],
  { cwd: root, encoding: "utf8" },
);
const match = output.match(/iOS buildNumber\s*-\s*(\d+)/i);

if (!match) {
  throw new Error("Could not read the remote iOS build number from EAS.");
}

const nextBuildNumber = String(Number.parseInt(match[1], 10) + 1);
// Edit the one value in place: re-serializing with JSON.stringify would undo
// app.json's Prettier formatting and fail check:format once committed.
const source = fs.readFileSync(appJsonPath, "utf8");
const buildNumberPattern = /("buildNumber"\s*:\s*")[^"]*(")/g;
if ((source.match(buildNumberPattern) ?? []).length !== 1) {
  throw new Error("Expected exactly one buildNumber in app.json.");
}
const updated = source.replace(buildNumberPattern, `$1${nextBuildNumber}$2`);
if (JSON.parse(updated).expo?.ios?.buildNumber !== nextBuildNumber) {
  throw new Error("app.json buildNumber is not at expo.ios.buildNumber.");
}
fs.writeFileSync(appJsonPath, updated);

console.log(
  `Synced ios.buildNumber to ${nextBuildNumber} so the app and widget match the next remote build.`,
);
