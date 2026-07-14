#!/usr/bin/env node
/**
 * Seeds the iOS Simulator's AsyncStorage so the demo can be shot against a
 * mature, good-looking account instead of an empty one.
 *
 * RN AsyncStorage on iOS is a directory of plain files:
 *   .../Library/Application Support/<bundleId>/RCTAsyncLocalStorage_V1/
 *     manifest.json   { key: value }  — values <=1024 bytes live inline
 *     <md5(key)>      the value, for anything larger  (manifest holds null)
 * (RNCAsyncStorage.mm: RCTInlineValueThreshold = 1024.)
 *
 * Usage:
 *   node seed.mjs side-hustle mature     # full account, ready to film
 *   node seed.mjs side-hustle fresh      # wiped, for the onboarding pass
 *   node seed.mjs side-hustle mature --dry   # report the numbers, write nothing
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const BUNDLE_ID = "com.resolutioncompanion.app";
const DEVELOPER_DIR = "/Applications/Xcode.app/Contents/Developer";
const INLINE_THRESHOLD = 1024;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const [, , scenarioName = "side-hustle", mode = "mature", ...rest] = process.argv;
const DRY = rest.includes("--dry");

// ─── date helpers (local time — the app keys logs on LOCAL YYYY-MM-DD) ─────
const today = new Date();
today.setHours(0, 0, 0, 0);

const dayKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daysAgo = (n) => {
  const d = new Date(today);
  d.setDate(d.getDate() - n);
  return d;
};
const weekdayOf = (d) => WEEKDAYS[d.getDay()];
const iso = (d, hour = 9) => {
  const x = new Date(d);
  x.setHours(hour, 0, 0, 0);
  return x.toISOString();
};

let idc = 0;
const id = (p) => `${p}-${(idc++).toString(36)}-demo`;

// ─── simulator plumbing ───────────────────────────────────────────────────
function bootedUdid() {
  const out = execFileSync("xcrun", ["simctl", "list", "devices", "booted"], {
    env: { ...process.env, DEVELOPER_DIR },
    encoding: "utf8",
  });
  const m = out.match(/\(([0-9A-F-]{36})\) \(Booted\)/i);
  if (!m) throw new Error("No booted simulator. Run: xcrun simctl boot <udid>");
  return m[1];
}

function storageDir(udid) {
  const container = execFileSync(
    "xcrun",
    ["simctl", "get_app_container", udid, BUNDLE_ID, "data"],
    { env: { ...process.env, DEVELOPER_DIR }, encoding: "utf8" },
  ).trim();
  return join(container, "Library", "Application Support", BUNDLE_ID, "RCTAsyncLocalStorage_V1");
}

/** Mirrors RNCAsyncStorage's _writeEntry: small values inline, big ones spilled to md5(key). */
function writeStore(dir, entries) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const manifest = {};
  for (const [key, value] of Object.entries(entries)) {
    if (value.length <= INLINE_THRESHOLD) {
      manifest[key] = value;
    } else {
      manifest[key] = null;
      writeFileSync(join(dir, createHash("md5").update(key).digest("hex")), value, "utf8");
    }
  }
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest), "utf8");
}

// ─── build the account ────────────────────────────────────────────────────
function build(scenario) {
  const persona = {
    id: id("persona"),
    name: scenario.persona.name,
    description: scenario.persona.description,
    createdAt: iso(daysAgo(45)),
  };

  const missKeys = new Set((scenario.missDaysAgo ?? []).map((n) => dayKey(daysAgo(n))));
  const partialKeys = new Set((scenario.partialDaysAgo ?? []).map((n) => dayKey(daysAgo(n))));
  const noteFor = new Map(
    Object.entries(scenario.notes ?? {}).map(([n, text]) => [dayKey(daysAgo(Number(n))), text]),
  );

  const benchmarks = [];
  const actions = [];
  const logs = [];

  scenario.milestones.forEach((m, idx) => {
    const bId = id("bm");
    const aId = id("act");
    const isHero = idx === 0; // the hero milestone is the one that completes on camera

    // Walk BACKWARD from yesterday collecting this action's scheduled days,
    // completing them until we hit the target. Deriving createdAt this way
    // (instead of hard-coding a start date) guarantees the exact daysDone —
    // which is what makes the 20/21 "completes on camera" trick reliable.
    const completed = [];
    let earliest = daysAgo(1);
    for (let n = 1; n <= 120 && completed.length < m.daysDone; n++) {
      const d = daysAgo(n);
      const k = dayKey(d);
      if (!m.action.frequency.includes(weekdayOf(d))) continue;
      if (missKeys.has(k)) continue; // left unlogged -> red on the calendar
      if (partialKeys.has(k) && !isHero) continue; // only the hero action lands -> amber
      completed.push(d);
      earliest = d;
    }

    const createdAt = iso(new Date(earliest.getTime() - 86400000));

    benchmarks.push({
      id: bId,
      personaId: persona.id,
      title: m.title,
      targetDate: dayKey(daysAgo(-m.targetDaysAhead)),
      status: "active", // never pre-complete: progress.ts pins completed ones at full
      createdAt,
    });
    actions.push({
      id: aId,
      benchmarkId: bId,
      title: m.action.title,
      frequency: m.action.frequency,
      anchorLink: m.action.anchorLink,
      kickstartVersion: m.action.kickstartVersion,
      createdAt,
    });

    for (const d of completed) {
      const k = dayKey(d);
      const note = isHero ? noteFor.get(k) : undefined;
      logs.push({
        id: id("log"),
        actionId: aId,
        logDate: k,
        status: true,
        createdAt: iso(d, 8),
        ...(note ? { note } : {}),
      });
    }
  });

  const reflections = (scenario.reflections ?? []).map((r) => ({
    id: id("refl"),
    periodType: r.periodType,
    userInput: r.userInput,
    aiFeedback: r.aiFeedback,
    momentumScore: r.momentumScore,
    createdAt: iso(daysAgo(r.daysAgo), 19),
    conversation: JSON.stringify([
      { id: id("msg"), role: "user", content: r.userInput, createdAt: iso(daysAgo(r.daysAgo), 19) },
      { id: id("msg"), role: "assistant", content: r.aiFeedback, createdAt: iso(daysAgo(r.daysAgo), 19) },
    ]),
  }));

  return { persona, benchmarks, actions, logs, reflections };
}

// ─── report: re-implements progress.ts so we can see what the app WILL show ─
function report({ persona, benchmarks, actions, logs }) {
  const done = new Set(logs.filter((l) => l.status).map((l) => `${l.actionId}|${l.logDate}`));
  const lines = [];

  lines.push(`persona:  ${persona.name}`);
  for (const b of benchmarks) {
    const acts = actions.filter((a) => a.benchmarkId === b.id);
    const start = new Date(b.createdAt);
    start.setHours(0, 0, 0, 0);
    let full = 0;
    for (const c = new Date(start); c <= today; c.setDate(c.getDate() + 1)) {
      const k = dayKey(c);
      const sched = acts.filter((a) => a.frequency.includes(weekdayOf(c)));
      if (!sched.length) continue;
      if (sched.every((a) => done.has(`${a.id}|${k}`))) full++;
    }
    const flag = full === 20 ? "  <- completes on camera (20 -> 21)" : "";
    lines.push(`milestone: ${String(full).padStart(2)}/21  ${b.title}${flag}`);
  }

  // whole-day status across ALL actions (what the calendar paints)
  let streak = 0;
  for (let n = 1; n <= 60; n++) {
    const d = daysAgo(n);
    const k = dayKey(d);
    const sched = actions.filter(
      (a) => a.frequency.includes(weekdayOf(d)) && new Date(a.createdAt) <= d,
    );
    if (!sched.length) continue;
    if (sched.every((a) => done.has(`${a.id}|${k}`))) streak++;
    else break;
  }

  let mDone = 0,
    mSched = 0;
  for (let n = 1; n <= today.getDate() - 1; n++) {
    const d = daysAgo(n);
    if (d.getMonth() !== today.getMonth()) continue;
    const k = dayKey(d);
    for (const a of actions) {
      if (!a.frequency.includes(weekdayOf(d))) continue;
      if (new Date(a.createdAt) > d) continue;
      mSched++;
      if (done.has(`${a.id}|${k}`)) mDone++;
    }
  }
  const consistency = mSched ? Math.round((mDone / mSched) * 100) : 0;

  const todaysActions = actions.filter((a) => a.frequency.includes(weekdayOf(today)));
  lines.push(`streak:   ${streak} days (unbroken, ending yesterday)`);
  lines.push(
    `${today.toLocaleString("en-US", { month: "long" })} consistency: ${consistency}%  ${
      consistency >= 80 ? "(green)" : consistency >= 50 ? "(cyan/green)" : "(AMBER — too low!)"
    }`,
  );
  lines.push(`today:    ${todaysActions.length} actions, unlogged — ${todaysActions.map((a) => a.title).join(" · ")}`);
  lines.push(`logs:     ${logs.length}`);
  return lines.join("\n");
}

// ─── go ───────────────────────────────────────────────────────────────────
const scenario = JSON.parse(readFileSync(join(HERE, "scenarios", `${scenarioName}.json`), "utf8"));
const data = build(scenario);

console.log(`\n── ${scenarioName} / ${mode} ─────────────────────────────`);
if (mode === "mature") console.log(report(data));

if (DRY) {
  console.log("\n(dry run — nothing written)\n");
  process.exit(0);
}

const udid = bootedUdid();
const dir = storageDir(udid);

if (mode === "fresh") {
  // Wipe everything so the onboarding pass starts at the intro carousel +
  // the AI-consent modal — i.e. exactly what a real new user sees.
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "manifest.json"), JSON.stringify({}), "utf8");
  console.log(`wiped: ${dir}\n`);
  process.exit(0);
}

const { persona, benchmarks, actions, logs, reflections } = data;
const monthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

writeStore(dir, {
  hasOnboarded: "true",
  aiConsent: "true",
  deviceId: "48822bef-f631-421f-bf95-a9f9dd72cf82",
  activePersonaId: persona.id,
  persona: JSON.stringify(persona),
  personas: JSON.stringify([persona]),
  benchmarks: JSON.stringify(benchmarks),
  elementalActions: JSON.stringify(actions),
  dailyLogs: JSON.stringify(logs),
  reflections: JSON.stringify(reflections),
  subscription: JSON.stringify({
    isPremium: true,
    plan: "yearly",
    expiresAt: iso(daysAgo(-300)),
    purchasedAt: iso(daysAgo(40)),
  }),
  monthlyReflectionCount: JSON.stringify({ month: monthKey, count: 2 }),

  // Pre-dismiss every first-run interstitial. Without these, a native
  // "Keep the streak alive?" permission alert fires 4s after the first
  // day-complete and lands right on top of the celebration shot.
  today_contextual_notif_ask_done: "true",
  today_first_day_complete_seen: "true",
  today_review_requested: "true",
  today_review_complete_days: "1",
  today_weekly_recap_seen_week: "seeded",
  today_weekly_nudge_seen_week: "seeded",
  progress_next_steps_dismissed: "true",
  journey_milestone_info_dismissed: "true",

  // Deliberately EMPTY: the hero milestone hits 21/21 during the take, and an
  // unseen id is what makes MilestoneCompleteModal fire on camera.
  milestone_celebration_seen_ids: JSON.stringify([]),
});

console.log(`\nseeded: ${dir}\n`);
