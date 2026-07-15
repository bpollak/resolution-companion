# Voiceover script — product demo

Two reads: the **master** (1:24, landscape) and the **short** (~35s, vertical).
Timestamps track the cut — the beat times below match the chapter markers
`gen-chapters.mjs` derives from the segments `build-edit.sh` produces, so they
stay honest when the edit changes. Both cuts end on a branded card
("Any day can be day one." + App Store badge) — that's where the closing
line lands.

**How to record:** Voice Memos is fine. Quiet room, phone ~6in away.
Conversational, not announcer — you're showing a friend something you built.
Don't rush to hit the marks; the video can be nudged to fit the read, not the
other way round.

**Tone note:** the on-screen captions already state the *what* ("Every action
is a vote"). The VO should carry the *why*. Don't read the captions aloud —
you'll sound like a slideshow.

---

## Master — 1:24 (landscape, for the website + YouTube)

| Time | On screen | Read |
|---|---|---|
| **0:00** | "Begin Your Evolution" | Most habit apps start by asking what you want to do. |
| **0:04** | Carousel → the AI-consent card | This one starts by asking who you want to become. |
| **0:10** | Coach's question streams in | It's a two-minute conversation with an AI coach — no sign-up, no forms. |
| **0:14** | You answer; the coach replies | You answer one honest question, and it turns your goal into habits small enough to actually do. |
| **0:20** | "Your plan is ready to build" | Then it builds the plan. |
| **0:24** | "Reading your goals…" → "Designing your milestones…" | Milestones, a few daily actions, scheduled around your real life. |
| **0:28** | Today — *Becoming Consistent Builder* | A few weeks in, this is the whole app. |
| **0:31** | *(hold on the day's actions)* | Two small things. That's the day. |
| **0:34** | Check-off → glow → "A vote for Consistent Builder ✓" | And every one you check off is a vote for the person you're becoming. |
| **0:37** | MILESTONE COMPLETE | Do it twenty-one times, and it stops being a plan. It's a habit. |
| **0:44** | Second check-off → 2/2 green ring | Finish the day… |
| **0:47** | "Day complete." burst | …and the app says so. That's the whole loop — show up, get seen, come back tomorrow. |
| **0:52** | Note: "How did it go?" | You can leave yourself a line. Your coach reads these. |
| **0:55** | Journey: the calendar | Green days, one amber, one red. You missed a day — nothing reset. |
| **1:02** | Milestone at 21/21 | Milestones only fill up. They never drain. |
| **1:08** | Coach: 100% momentum | And the coach actually remembers — your streak, your best day, the notes you left. |
| **1:11** | Weekly review: your answer sends | You name a win, and it answers you — specifically, personally. |
| **1:16** | *(the coach's reply streams)* | It's not a tracker. It's someone in your corner. |
| **1:20** | End card: logo + badge | Resolution Companion. Free on the App Store. Any day can be day one. |

---

## Short — ~35s (vertical, for Reels / TikTok / Shorts)

Cut from the same footage. Punchier; the first line has ~2 seconds to stop the
scroll, so lead with the hook, not the product.

| Time | On screen | Read |
|---|---|---|
| **0:00** | "Begin Your Evolution" | I built a habit app that doesn't ask what you want to do. |
| **0:03** | The AI interview | It asks who you want to become. |
| **0:10** | Plan builds | Two minutes with an AI coach, and it writes you a real plan — milestones, tiny daily actions. |
| **0:13** | Check-off → MILESTONE COMPLETE | Every action you check off is a vote for that person. |
| **0:19** | Day complete | Finish the day, and it says so. |
| **0:21** | Calendar, the missed day | Miss a day? Nothing resets. Milestones only fill up. |
| **0:27** | Coach replies | And the coach remembers what you did — and answers back. |
| **0:32** | End card | Free on the App Store. Any day can be day one. |

---

## Notes for the edit

- **Continuity:** the onboarding is shot live, so the AI names the persona
  itself (it produced *"Launched Side-Project Creator"* on the take we used).
  The cut deliberately ends the onboarding on the plan-building sequence,
  **before** the generated plan is revealed — so it never contradicts the
  seeded *"Consistent Builder"* in the tour. The line **"A few weeks in…"** at
  0:28 is what bridges that gap. Keep it, or the jump reads as a bug.
- **The coach exchange is a complete round trip.** The weekly-review beat now
  runs ask → answer → reply: the coach names the week's numbers, the user types
  a real win, and the coach responds with a specific, personal follow-up. (It's
  from a separate take; the tour's own weekly review only reached the question —
  which is also why the coach-home segment ends *before* that take's review sheet
  opens, so the two takes' different greetings never collide on screen.) The raw
  take ends while the reply is still streaming, so the cut closes on the reply's
  complete question ("…next week's momentum?") and the end card fades in over it.
- **Nothing here is faked.** The coach's replies stream from production, and the
  numbers it quotes are read from the real seeded history.
- **Speed ramps:** the app's thinking time is real, and the pauses are the
  product. They're sped up 1.4–3.4x, never cut. The payoff beats — the
  check-off, the milestone, the day-complete — play at or near 1x.
- **One thing to know:** onboarding was tightened to a single question→answer→
  reply (the old cut showed two exchanges and dragged). Every source window is
  now selected frame-accurately (`trim` filter, not `-ss`), which is what fixed
  the earlier out-of-sequence jump in the interview.
