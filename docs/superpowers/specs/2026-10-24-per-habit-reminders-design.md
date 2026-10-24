# Per-habit reminder times: design

Date: 2026-10-24 · Status: approved approach (A), spec pending review

## Intent

Brett's ask: more frequent, better-timed reminders so people do the specific
habits (Elemental Actions) they set up, at the moment those habits happen in
their day.

Agreed scope:

- Each habit can carry its own reminder time. Its reminder fires at that time,
  only on its scheduled weekdays, and only if it is not yet logged that day.
- The time is **suggested from the habit's anchor and editable** in the Action
  editor (no new onboarding step).
- **Free** for everyone. Premium stays about the coach.
- Delivery stays **local notifications** (expo-notifications). No server push,
  no APNs, no server or schema change: actions live only on device.

Success looks like: a user with "Meditate after morning coffee" gets one buzz
around 7:30 AM that says "Meditate", taps "Done ✓" from the lock screen, and
gets nothing else about it that day. A user who never touches the setting
sees no change in notification volume.

## Current state (what we build on)

`client/lib/notifications.ts` (1,066 lines) schedules **one digest per day** at
a user-chosen bucket (Morning 8:00 / Midday 12:00 / Evening 20:00), listing
still-open habits, over a rolling 14-day horizon. It has: a serial lock
(`withReminderLock`), a plan signature that skips no-op reschedules, a
portfolio-of-hooks copy rotation that learns per user, a "Mark all done ✓"
category action handled in `AppContext.tsx` (~L1066-1131), and keyword
mapping from anchors to buckets (`BUCKET_KEYWORDS`, `suggestReminderBucket`).

## Design

### 1. Data model

`ElementalAction` (`client/lib/storage.ts`) gains one optional field:

```ts
/** Local "HH:MM" (24h) for this habit's own reminder; absent = digest only. */
reminderTime?: string;
```

Absent on all existing records, so no migration step. A string rather than
hour/minute keeps the signature and storage diff trivial and is
timezone-free by construction (fires at local wall-clock time, matching the
Pacific-aware progress math).

### 2. Time suggestion (`client/lib/habit-reminders.ts`, new, pure)

`suggestReminderTime(anchorLink: string): string | null` maps anchor keywords
to a time, conservatively:

| Keywords | Time |
|---|---|
| wake, alarm, sunrise | 07:00 |
| coffee, breakfast, morning | 07:30 |
| lunch, noon, midday | 12:15 |
| afternoon | 15:00 |
| after work, commute home | 17:30 |
| dinner | 18:30 |
| evening, night | 20:00 |
| bed, end of day | 21:30 |

First match in table order wins (so "after morning coffee" → 07:30, not a
tie). No match → `null` (no guess). The editor's fallback anchor string
`"After I wake up"` (ActionEditorScreen L163/L173, applied when the field is
blank) returns `null` so blank anchors don't all collapse to 7 AM.

`BUCKET_KEYWORDS` stays as is for the digest bucket; the two tables are
deliberately separate (bucket = coarse, time = specific).

### 3. When a time gets set

- **New habit (Action editor, onboarding, AI tune-up):** when an action is
  created and the suggestion is non-null, `reminderTime` is pre-filled. The
  user sees it before saving in the editor; onboarding/tune-up-created
  actions get it silently and it's editable later.
- **Existing habits:** untouched on update. When the user next turns
  reminders on (primer card, Profile toggle), habits without a
  `reminderTime` get the suggestion applied once. This matches the
  approved "A as described" and avoids surprise buzzes on upgrade.
- If notifications are **off**, a stored `reminderTime` is inert.

### 4. Action editor UI

New row under the anchor field, following UI conventions (Pressable,
hitSlop, haptic on toggle):

- `Remind me at 7:30 AM` with a Switch. Tapping the time opens a compact
  in-app picker (hour + 15-minute steps, AM/PM). No time-picker native
  module is installed, and adding one mid-release would force a native
  rebuild for little gain.
- Switch off clears `reminderTime`.
- Helper text when notifications are disabled: "Turn on reminders in
  Settings to get this." (links to Profile).
- Editing the anchor re-suggests only if the user has not manually set a
  time in this edit session.

### 5. Scheduling

Both kinds are planned together in `scheduleDailyReminderLocked`, under the
existing lock, with one signature covering both, so all current
serialization and no-op guarantees carry over.

Per day in the horizon:

1. **Timed slots:** take that day's remaining habits (existing
   `getRemainingReminderActions`) that have `reminderTime`. Sort by time.
   Coalesce habits whose times fall within **15 minutes** of the group's
   first time into one slot firing at that first time. Drop slots whose
   fire time is already past.
2. **Digest:** the existing digest, but its `remainingActions` exclude timed
   habits. If none remain, no digest that day.

**Budget:** iOS keeps at most 64 pending local notifications per app. Plan
day by day from today, adding that day's timed slots plus digest, and stop
before exceeding **60** total (4 held back as headroom). With 1-2 habits
this covers the full 14 days; with many timed habits the horizon shortens.
Foreground refresh (already runs on app active) tops it back up, so active
users never run dry; a user who stops opening the app gets reminders for
fewer days, which is acceptable.

Pure planning lives in `habit-reminders.ts`
(`planTimedSlots(day, actions, dailyLogs, now)`, `fitToBudget(days, max)`)
so it is unit-testable without expo mocks; `notifications.ts` only calls it
and schedules. This keeps the 1,066-line module from growing much.

**Cancellation:** timed notifications carry `data.type = "habit-reminder"`.
`isDailyReminderRequest` (L547) is widened to cancel both types, so the
existing cancel-and-replace flow covers them. Logging a habit already
triggers `maintainReminders` (TodayScreen), and the plan signature changes
because remaining actions changed, which removes that habit's pending
reminder for today. When the day is complete, `suppressReminderForToday`
starts the window tomorrow, which drops today's timed slots with the digest.

### 6. Notification content and actions

- New category `habit-reminder` with one action: **"Done ✓"**
  (`opensAppToForeground: false`).
- Title: the habit title (or "Meditate + Journal" for a coalesced slot;
  3+ → "Meditate + 2 more").
- Body: kickstart framing, e.g. "The 2-minute version counts: sit for two
  minutes." Uses `kickstartVersion`, truncated via existing
  `truncateReminderText`.
- `data`: `{ type: "habit-reminder", dateKey, actionIds }`.
- Android channel: reuse `daily-reminder`.
- Hook rotation/learning stays with the digest only; per-habit copy is not
  rotated (YAGNI until there is data).

### 7. Response handling (`AppContext.tsx`)

Extend the existing listener:

- `habit-reminder` + "Done ✓" → complete exactly `data.actionIds` for
  `data.dateKey`, reusing `selectMarkAllDoneActions` (it already filters by
  weekday and start date, and completion is idempotent) with
  `completionSource: "notification"`.
- `habit-reminder` default tap → open Today (current behavior for the
  digest tap).
- Same `isLoading` guard as the pending-widget-vote race fix.

### 8. Telemetry

Use existing telemetry: count `habit-reminder` taps vs "Done ✓" completions,
so the engagement plan can compare timed vs digest-only users. No new
endpoints.

## Error handling

- Invalid/unparseable `reminderTime` → treated as absent (habit goes to
  digest), logged once.
- Permission denied → existing behavior (no scheduling; editor helper text).
- Scheduling failure → existing `logger.error` + return; digest and timed
  slots fail together, never half-scheduled, because cancel-and-replace
  runs under one lock.

## Testing

- `habit-reminders.test.ts` (pure, `TZ=America/Los_Angeles`):
  suggestion table and `"After I wake up"` → null; coalescing at 0, 14, 15,
  16 min apart; weekday filtering; already-logged habit dropped; past slots
  dropped; budget cuts at 60 and keeps whole days; DST boundary week
  (Nov 1 2026) fires at correct wall-clock time.
- Extend `reminder-schedule.test.ts`: digest excludes timed habits; no
  digest when all are timed; signature changes when a time changes and not
  when an unrelated log changes; cancel removes both types.
- Extend completion tests: "Done ✓" completes only its `actionIds`.
- Simulator (Maestro or manual via `xcrun simctl`): set a habit 2 minutes
  out, receive it, tap "Done ✓" from the banner, confirm Today shows it done
  and no digest lists it.
- `npm run check:types`, `npm run lint`, `npm test` all green.

## Out of scope

- Server push / APNs (no use case needs it yet).
- Multiple times per habit, snooze, location triggers.
- Learning optimal times from completion history (good follow-up once
  telemetry exists).
- Android-specific exact-alarm permission work beyond what the digest uses.

## Open items for planning

- Version bump target (1.5.1 vs 1.6.0) per the build-train rule.
