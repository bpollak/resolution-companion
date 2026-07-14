# Automated product demo

Records a real screen capture of the app — someone onboarding, then actually
using it — and cuts it into a narrated demo. Fully automated: one command per
take, re-runnable, and swappable to a different use case by editing one JSON.

```
./record.sh both      # shoot both passes (~6 min)
./build-edit.sh       # cut them into out/screen.mp4
cd ../promo-video && npx remotion render src/index.ts DemoMaster out/demo-master-16x9.mp4 --codec=h264
                      npx remotion render src/index.ts DemoShort  out/demo-short-9x16.mp4  --codec=h264
```

Deliverables: **`demo-master-16x9.mp4`** (1:41, website + YouTube),
**`demo-short-9x16.mp4`** (vertical), and **`VO-SCRIPT.md`** — a timed
narration script to read over either.

---

## How it works

**Two passes, two app states.**

| Pass | State | Captures |
|---|---|---|
| `onboarding` | storage wiped | the intro, the AI-consent screen, the **live** AI interview, the plan being built |
| `tour` | seeded, ~5-week-old account | check-off → milestone → day complete → note → calendar → coach |

The onboarding pass is shot **live against production** — the coach's replies
really do stream in at 30ms/char, and the plan is really generated from what
gets typed. Nothing is mocked.

The tour has to be **seeded**, because the app is honest about a new account:
on a fresh install the consistency ring reads 0% (which the app renders
*amber* — its "you're struggling" colour), the streak reads "0-day", and every
milestone reads "0/21". Shooting the feature tour on a fresh account would make
the product look broken. So `seed.mjs` fabricates a believable history first.

**`seed.mjs` writes AsyncStorage directly.** On iOS, RN AsyncStorage is just a
directory of files — `manifest.json` for small values, plus one file per large
value named `md5(key)`. So we can fabricate any app state we like from the
outside, with **zero changes to the app**. Nothing here ships to users.

**Maestro drives the UI** (`brew install maestro`, needs a JDK). The app is
React Native and exposes almost no text to iOS accessibility, so Maestro's text
selectors can't see it — every tap is a **measured coordinate** instead. That's
fine here: fixed device (iPhone 17), fixed seed, deterministic layout. All the
coordinates are commented in the flows.

**`xcrun simctl io … recordVideo`** captures the device screen only — no mouse
cursor, no simulator chrome — which is why this beats screen-recording the
window.

---

## The trick that makes the demo good

The seed puts the hero milestone at **20 of 21 days**. So when the tour checks
that action off, it lands on 21/21 and the app fires its **MILESTONE COMPLETE**
modal for real, on camera:

> *"You did the thing on 21 scheduled days — that's not a plan anymore, it's a
> habit."*

That beat isn't staged. It's the app doing what it does, because the data made
it true. The seed also deliberately leaves **one missed day** (red on the
calendar) and **one partial day** (amber), so the calendar proves the "a missed
day never erases you" claim instead of just asserting it.

The seed also pre-dismisses every first-run interstitial
(`today_contextual_notif_ask_done`, `today_review_requested`, …). Without that,
a native *"Keep the streak alive?"* permission alert fires **four seconds after
the first day-complete** and lands right on top of the celebration.

---

## Swapping the use case

`scenarios/side-hustle.json` is the one that's built. To make a different demo,
copy it, edit the persona / milestones / actions / typed answers, and re-run —
the whole pipeline is parameterised.

| Scenario | Persona | Angle |
|---|---|---|
| **`side-hustle`** ✅ | Consistent Builder | Creator / founder. The one that's built. |
| `movement` | Consistent Morning Mover | The archetypal dropped resolution. Broadest appeal. |
| `screen-time` | Off my phone by 10 | The most modern, most distinctive angle. |
| `language` | Conversational Spanish Speaker | Proves the AI adapts beyond fitness. |
| `sleep` | Asleep by 11 | Health-adjacent, low-effort to relate to. |

Keep `daysDone: 20` on the first milestone in any new scenario — that's what
makes the milestone fire on camera. `seed.mjs --dry` prints exactly what the app
will show (milestone progress, streak, consistency, today's actions) before you
write anything.

```
node seed.mjs side-hustle mature --dry
```

---

## Gotchas, all learned the hard way

- **Cold boot.** After a storage wipe the app takes ~10s to render. Tap earlier
  and the taps land on the tab bar instead of the onboarding CTA.
- **Keyboard.** Tapping the chat input raises the keyboard, which lifts the send
  button from 92% → 54%. `hideKeyboard` is unsupported on iOS. Both scripted
  answers wrap to three lines, so 54% is exact for both.
- **Maestro percentages must be integers.** `"66.5%"` throws a
  `NumberFormatException`.
- **The Coach lobby doesn't scroll** — it bounces back. Don't swipe before
  tapping the weekly-review card; it sits at 79% unscrolled.
- **Maestro has no `wait` command** (by design — artificial waits make tests
  flaky). This isn't a test, it's a camera, so `flows/hold.js` provides one.
