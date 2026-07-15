#!/usr/bin/env node
/**
 * Speaking script + subtitle (.srt) files for the real-device promo cuts.
 * One narration, timed to the footage; the same lines become subtitles for
 * each of the four cuts (vertical master/short, landscape master/short).
 * Times are derived from the segment durations build-iphone*.sh produced, so
 * they stay in sync when the cut changes.
 *
 *   node gen-iphone-vo.mjs
 *     -> ../promo-video/subtitles/{IPhonePromo,IPhonePromoShort,
 *         IPhoneWideMaster,IPhoneWideShort}.srt
 *     -> VO-SCRIPT-iphone.md
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const dur = (f) =>
  parseFloat(
    execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", join(HERE, f)], {
      encoding: "utf8",
    }).trim(),
  );

const timeline = (keys) => {
  const map = {};
  let t = 0;
  for (const k of keys) {
    map[k] = t;
    t += dur(`seg/${k}.mp4`);
  }
  map.__total = t;
  return map;
};

const MASTER_ORDER = ["i1a","i1b","i1c","i1d","i1e","i1f","i1g","i2a","i3a","i3b","i3c","i3d","i4a","i4b","i4c","i4d","i4e","i4f","i4g","i4h","i4i"];
const SHORT_ORDER = ["is1","is2","is3","is4","is5","is6","is7","is8"];
const M = timeline(MASTER_ORDER);
const S = timeline(SHORT_ORDER);

// Narration cues, anchored to a segment + offset (footage-relative seconds).
// Kept short so each doubles as a readable subtitle.
const MASTER_CUES = [
  ["i1a", 0.0, "Most habit apps ask what you want to do."],
  ["i1b", 0.1, "This one asks who you want to become."],
  ["i1c", 0.0, "It's a two-minute chat with an AI coach."],
  ["i1d", 1.0, "You tell it your goal — mine was running my first 5K."],
  ["i1d", 5.7, "And it writes you a real plan."],
  ["i1g", 0.5, "Milestones, and a few small daily actions."],
  ["i2a", 0.5, "Each day, you check off a couple of small things."],
  ["i2a", 3.3, "Finish the day, and it says so."],
  ["i3a", 0.5, "Your progress fills in — and never resets."],
  ["i3b", 0.3, "Shape it your way: milestones, dates, how often."],
  ["i4b", 0.1, "Every week, your coach checks in,"],
  ["i4d", 0.3, "and remembers what you did."],
  ["i4f", 0.5, "Then it actually coaches you —"],
  ["i4f", 3.6, "adjusting the plan so you don't burn out."],
  ["i4h", 0.3, "Specific, personal, every single week."],
  ["i4i", 0.3, "Not a tracker. Someone in your corner."],
];
const SHORT_CUES = [
  ["is1", 0.0, "This app doesn't ask what you want to do."],
  ["is2", 0.0, "It asks who you want to become."],
  ["is3", 0.5, "Tell an AI coach your goal, and it builds a real plan."],
  ["is4", 0.3, "Milestones and small daily actions."],
  ["is5", 0.5, "Check off your day —"],
  ["is5", 2.4, "and it says so."],
  ["is6", 0.3, "Each week, your coach checks in."],
  ["is7", 0.2, "Tell it what's hard,"],
  ["is8", 0.5, "and it adapts the plan to how you're doing."],
];
const CTA = "Resolution Companion — free on the App Store.";

// Composition constants (must match IPhonePromo.tsx).
const FPS = 30, TITLE_FRAMES = 60, FADE = 16, CARD_FRAMES = 105;
const VERT_OFFSET = (TITLE_FRAMES - FADE) / FPS; // footage starts here in vertical cuts
const ctaStartVert = (sec) => (TITLE_FRAMES - FADE + Math.round(sec * FPS) - FADE) / FPS;
const ctaStartWide = (sec) => (Math.round(sec * FPS) - FADE) / FPS;

const srtTime = (s) => {
  const ms = Math.max(0, Math.round(s * 1000));
  const h = String(Math.floor(ms / 3600000)).padStart(2, "0");
  const m = String(Math.floor((ms % 3600000) / 60000)).padStart(2, "0");
  const sec = String(Math.floor((ms % 60000) / 1000)).padStart(2, "0");
  const mil = String(ms % 1000).padStart(3, "0");
  return `${h}:${m}:${sec},${mil}`;
};

/** Build one cut's absolute-timed cue list (content cues + CTA). */
const cut = (cues, map, offset, ctaStart, totalSec) => {
  const rows = cues.map(([seg, off, text]) => ({ start: offset + map[seg] + off, text }));
  rows.push({ start: ctaStart, text: CTA });
  rows.sort((a, b) => a.start - b.start);
  return rows.map((r, i) => {
    const next = rows[i + 1];
    const end = next ? Math.min(next.start - 0.1, r.start + 5.0) : Math.min(totalSec - 0.1, r.start + 3.0);
    return { ...r, end };
  });
};

const toSrt = (rows) =>
  rows.map((r, i) => `${i + 1}\n${srtTime(r.start)} --> ${srtTime(r.end)}\n${r.text}`).join("\n\n") + "\n";

const outDir = join(HERE, "..", "promo-video", "subtitles");
mkdirSync(outDir, { recursive: true });

const CUTS = [
  ["IPhonePromo", MASTER_CUES, M, VERT_OFFSET, ctaStartVert(M.__total), VERT_OFFSET + M.__total + CARD_FRAMES / FPS],
  ["IPhonePromoShort", SHORT_CUES, S, VERT_OFFSET, ctaStartVert(S.__total), VERT_OFFSET + S.__total + CARD_FRAMES / FPS],
  ["IPhoneWideMaster", MASTER_CUES, M, 0, ctaStartWide(M.__total), M.__total + CARD_FRAMES / FPS],
  ["IPhoneWideShort", SHORT_CUES, S, 0, ctaStartWide(S.__total), S.__total + CARD_FRAMES / FPS],
];

for (const [name, cues, map, offset, ctaS, total] of CUTS) {
  writeFileSync(join(outDir, name + ".srt"), toSrt(cut(cues, map, offset, ctaS, total)));
}

// Readable speaking script (footage-relative times; the vertical cuts add a
// ~1.5s title card first, handled automatically in the .srt files).
const scriptTable = (cues, map) =>
  cues
    .map(([seg, off, text]) => `| ${(map[seg] + off).toFixed(1).padStart(5)}s | ${text} |`)
    .join("\n");

const md = `# Speaking script — real-device promo

One narration for all four cuts (same footage). Read it conversationally, like
you're showing a friend the app you built. Timestamps are **footage-relative**
(the vertical cuts play a ~1.5s title card first; the generated \`.srt\` files
already account for that).

Subtitle files are generated alongside this script:
\`marketing/promo-video/subtitles/*.srt\` — one per cut, correctly timed. Most
social tools (Instagram, TikTok, YouTube, CapCut) import \`.srt\` directly, or
burn them in with ffmpeg (\`-vf subtitles=NAME.srt\`).

Regenerate with \`node marketing/demo-video/gen-iphone-vo.mjs\`.

## Master (${M.__total.toFixed(0)}s of footage)

| Time | Line |
|---|---|
${scriptTable(MASTER_CUES, M)}
|  end | ${CTA} |

## Social / short (${S.__total.toFixed(0)}s of footage)

| Time | Line |
|---|---|
${scriptTable(SHORT_CUES, S)}
|  end | ${CTA} |

## Notes
- The **landscape** cuts already show the feature captions on the right, so
  subtitles there are optional — use them only if a platform expects a caption
  track. The **vertical** cuts have no on-screen text, so subtitles (or your VO)
  carry the message.
- The coach's on-screen replies are live AI; the VO never quotes them verbatim,
  so re-recording against a new take won't break the script.
`;

writeFileSync(join(HERE, "VO-SCRIPT-iphone.md"), md);

// Footage-relative cue list (content cues only, no CTA) for the vertical
// Remotion compositions to render burned-in subtitles.
const subRows = (cues, map) => {
  const rows = cues
    .map(([seg, off, text]) => ({ start: +(map[seg] + off).toFixed(2), text }))
    .sort((a, b) => a.start - b.start);
  return rows.map((r, i) => {
    const next = rows[i + 1];
    const end = next ? Math.min(next.start - 0.1, r.start + 5.0) : Math.min(map.__total, r.start + 4.0);
    return { start: r.start, end: +end.toFixed(2), text: r.text };
  });
};
const emitSubs = (rows) =>
  rows.map((r) => `  { start: ${r.start}, end: ${r.end}, text: ${JSON.stringify(r.text)} },`).join("\n");
const subsTs = `// GENERATED by marketing/demo-video/gen-iphone-vo.mjs — do not hand-edit.
// Footage-relative subtitle cues for the vertical promo cuts.

export interface Sub {
  start: number;
  end: number;
  text: string;
}

export const SUB_MASTER: Sub[] = [
${emitSubs(subRows(MASTER_CUES, M))}
];

export const SUB_SHORT: Sub[] = [
${emitSubs(subRows(SHORT_CUES, S))}
];
`;
writeFileSync(join(HERE, "..", "promo-video", "src", "iphone-subtitles.ts"), subsTs);

console.log(`master ${M.__total.toFixed(2)}s · short ${S.__total.toFixed(2)}s`);
console.log("wrote 4 .srt files ->", outDir);
console.log("wrote VO-SCRIPT-iphone.md + src/iphone-subtitles.ts");
