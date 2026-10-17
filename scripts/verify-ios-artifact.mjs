import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ipaPath = path.resolve(process.argv[2] || "build/ios-local.ipa");
if (!fs.existsSync(ipaPath)) {
  throw new Error(`Missing iOS artifact: ${ipaPath}`);
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "rc-ios-verify-"));
try {
  execFileSync("unzip", ["-q", ipaPath, "-d", tempDir]);
  const payload = path.join(tempDir, "Payload");
  const appName = fs.readdirSync(payload).find((name) => name.endsWith(".app"));
  if (!appName) throw new Error("IPA does not contain an app bundle.");

  const appPath = path.join(payload, appName);
  const pluginDir = path.join(appPath, "PlugIns");
  const extensionName = fs
    .readdirSync(pluginDir)
    .find((name) => name.endsWith(".appex"));
  if (!extensionName)
    throw new Error("IPA does not contain the widget extension.");

  const readPlist = (bundlePath, key) =>
    execFileSync(
      "/usr/libexec/PlistBuddy",
      ["-c", `Print :${key}`, path.join(bundlePath, "Info.plist")],
      { encoding: "utf8" },
    ).trim();
  const extensionPath = path.join(pluginDir, extensionName);
  const appBuild = readPlist(appPath, "CFBundleVersion");
  const extensionBuild = readPlist(extensionPath, "CFBundleVersion");
  const appVersion = readPlist(appPath, "CFBundleShortVersionString");
  const extensionVersion = readPlist(
    extensionPath,
    "CFBundleShortVersionString",
  );

  if (appBuild !== extensionBuild || appVersion !== extensionVersion) {
    throw new Error(
      `App/widget version mismatch: app ${appVersion} (${appBuild}), widget ${extensionVersion} (${extensionBuild}).`,
    );
  }
  console.log(`Verified app and widget at ${appVersion} (${appBuild}).`);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
