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
const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf8"));
appJson.expo.ios.buildNumber = nextBuildNumber;
fs.writeFileSync(appJsonPath, `${JSON.stringify(appJson, null, 2)}\n`);

console.log(
  `Synced ios.buildNumber to ${nextBuildNumber} so the app and widget match the next remote build.`,
);
