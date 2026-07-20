import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const releasesPath = path.join(root, "public", "releases.json");
const appJsonPath = path.join(root, "app.json");
const appStoreId = "6757996708";
const allowedStatuses = new Set(["draft", "submitted", "released"]);

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeReleases(releases) {
  fs.writeFileSync(releasesPath, `${JSON.stringify(releases, null, 2)}\n`);
}

function currentVersion() {
  const appJson = loadJson(appJsonPath);
  const version = appJson?.expo?.version;
  if (typeof version !== "string" || !version.trim()) {
    throw new Error("app.json must define expo.version before release work.");
  }
  return version;
}

function versionParts(version) {
  return version.split(".").map((part) => Number.parseInt(part, 10) || 0);
}

function compareVersions(left, right) {
  const leftParts = versionParts(left);
  const rightParts = versionParts(right);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (rightParts[index] || 0) - (leftParts[index] || 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function validateRelease(release, index) {
  const prefix = `releases.json entry ${index + 1}`;
  for (const field of ["version", "status", "title", "summary"]) {
    if (typeof release?.[field] !== "string" || !release[field].trim()) {
      throw new Error(`${prefix} requires a non-empty ${field}.`);
    }
  }
  if (!/^\d+(?:\.\d+){1,2}$/.test(release.version)) {
    throw new Error(`${prefix} has an invalid version number.`);
  }
  if (!allowedStatuses.has(release.status)) {
    throw new Error(`${prefix} has unsupported status ${release.status}.`);
  }
  if (
    !Array.isArray(release.appStoreNotes) ||
    release.appStoreNotes.length < 1
  ) {
    throw new Error(`${prefix} requires at least one App Store release note.`);
  }
  if (
    release.appStoreNotes.some(
      (note) => typeof note !== "string" || !note.trim(),
    )
  ) {
    throw new Error(`${prefix} App Store notes must be non-empty strings.`);
  }
  if (!Array.isArray(release.highlights) || release.highlights.length < 1) {
    throw new Error(`${prefix} requires at least one website highlight.`);
  }
  if (
    release.highlights.some(
      (highlight) =>
        typeof highlight?.title !== "string" ||
        !highlight.title.trim() ||
        typeof highlight?.description !== "string" ||
        !highlight.description.trim(),
    )
  ) {
    throw new Error(`${prefix} highlights require a title and description.`);
  }
  if (
    release.media &&
    (["src", "poster", "title", "description"].some(
      (field) =>
        typeof release.media[field] !== "string" ||
        !release.media[field].trim(),
    ) ||
      !Array.isArray(release.media.transcript) ||
      release.media.transcript.length < 1 ||
      release.media.transcript.some(
        (line) => typeof line !== "string" || !line.trim(),
      ))
  ) {
    throw new Error(
      `${prefix} media requires source, poster, copy, and transcript.`,
    );
  }
  if (release.media) {
    for (const field of ["src", "poster"]) {
      const asset = release.media[field];
      const assetPath = path.resolve(root, "public", asset.replace(/^\//, ""));
      const publicRoot = path.resolve(root, "public") + path.sep;
      if (!assetPath.startsWith(publicRoot) || !fs.existsSync(assetPath)) {
        throw new Error(
          `${prefix} references a missing ${field} asset: ${asset}`,
        );
      }
    }
  }
  if (release.status === "submitted" && !release.submittedAt) {
    throw new Error(`${prefix} must include submittedAt when submitted.`);
  }
  if (release.status === "released" && !release.releasedAt) {
    throw new Error(`${prefix} must include releasedAt when released.`);
  }
}

function validateAll() {
  const releases = loadJson(releasesPath);
  if (!Array.isArray(releases) || releases.length < 1) {
    throw new Error("public/releases.json must contain at least one release.");
  }

  releases.forEach(validateRelease);
  const versions = releases.map((release) => release.version);
  if (new Set(versions).size !== versions.length) {
    throw new Error("public/releases.json contains a duplicate version.");
  }

  const sorted = [...releases].sort((left, right) =>
    compareVersions(left.version, right.version),
  );
  if (JSON.stringify(sorted) !== JSON.stringify(releases)) {
    throw new Error(
      "public/releases.json must be ordered newest version first.",
    );
  }

  const version = currentVersion();
  if (releases[0].version !== version) {
    throw new Error(
      `app.json is version ${version}, but the newest release-notes entry is ${releases[0].version}. Add its release notes before building.`,
    );
  }

  return { releases, version };
}

function localDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function check() {
  const { releases, version } = validateAll();
  console.log(
    `Release notes ready for ${version} (${releases[0].status}; ${releases[0].appStoreNotes.length} App Store notes).`,
  );
}

function notes() {
  const { releases } = validateAll();
  console.log(releases[0].appStoreNotes.map((note) => `• ${note}`).join("\n"));
}

function markSubmitted() {
  const { releases, version } = validateAll();
  const release = releases[0];
  if (release.status === "released") {
    console.log(
      `Version ${version} is already marked released; no status changed.`,
    );
    return;
  }
  release.status = "submitted";
  release.submittedAt ||= localDate();
  writeReleases(releases);
  console.log(
    `Marked ${version} submitted. Commit and deploy public/releases.json to update the Release Notes page.`,
  );
}

async function sync() {
  const { releases, version } = validateAll();
  const response = await fetch(
    `https://itunes.apple.com/lookup?id=${appStoreId}&country=us`,
  );
  if (!response.ok) {
    throw new Error(`Apple lookup failed with HTTP ${response.status}.`);
  }
  const payload = await response.json();
  const live = payload?.results?.[0];
  if (!live?.version) {
    throw new Error("Apple lookup did not return a current app version.");
  }
  if (live.version !== version) {
    console.log(
      `Apple currently reports ${live.version}; ${version} remains ${releases[0].status}.`,
    );
    return;
  }

  const release = releases[0];
  const releaseDate = live.currentVersionReleaseDate?.slice(0, 10);
  const changed =
    release.status !== "released" || release.releasedAt !== releaseDate;
  release.status = "released";
  release.releasedAt = releaseDate || localDate();
  writeReleases(releases);
  console.log(
    changed
      ? `Apple confirms ${version} is live. Release status updated.`
      : `Apple confirms ${version} is live; release status was already current.`,
  );
}

const command = process.argv[2] || "check";

try {
  if (command === "check") check();
  else if (command === "notes") notes();
  else if (command === "mark-submitted") markSubmitted();
  else if (command === "sync") await sync();
  else {
    throw new Error(
      `Unknown command ${command}. Use check, notes, mark-submitted, or sync.`,
    );
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
