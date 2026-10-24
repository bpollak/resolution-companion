# Per-habit Reminder Times Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each habit can carry its own local reminder time; it fires only on scheduled, still-open days, with a "Done ✓" lock-screen action. Ships as 1.6.0.

**Architecture:** Pure planning in new `client/lib/habit-reminders.ts` (suggestion table, timed-slot coalescing, budget fitting). `notifications.ts` schedules timed slots plus the digest (now untimed habits only) in its existing locked cancel-and-replace run. `AppContext` handles the new category through the existing response path.

**Tech Stack:** Expo SDK 54, expo-notifications 0.32, `@react-native-community/datetimepicker` 8.4.4 (added; native iOS picker), Jest under `TZ=America/Los_Angeles`.

**Spec:** `docs/superpowers/specs/2026-10-24-per-habit-reminders-design.md`
(Deviation, approved by "proceed as 1.6": native time picker instead of the
in-app stepper, since 1.6 is a new native binary anyway.)

## Global Constraints

- `expo.version` = `1.6.0` in `app.json` (1.5.0 is released; train closed).
- `reminderTime` format: local `"HH:MM"` 24h; invalid → treated as absent.
- Coalesce window: 15 minutes from a group's first time. Budget: 60 pending.
- `data.type` for timed: `"habit-reminder"`; category `habit-reminder`;
  button `"Done ✓"`, identifier reuses `MARK_ALL_DONE_ACTION`.
- Hook rotation and hook learning apply to the digest only.
- Every tappable is a `Pressable` with pressed style, hitSlop ≥ 8.
- Node 22 (`~/.local/bin/node`); local builds only, never EAS cloud.

## Review Focus

1. User logs a habit, then its timed reminder must not fire later that day (signature changes → reschedule removes it).
2. All habits timed → no digest; mix → digest lists only untimed ones.
3. Habit scheduled Mon/Wed/Fri with a time → no reminder Tue.
4. Turning reminders off cancels timed ones too (`isDailyReminderRequest` widened).
5. Cold-launch "Done ✓" before store loads completes only that slot's habits.

---

### Task 1: Pure planner `habit-reminders.ts`

**Files:** Create `client/lib/habit-reminders.ts`, `client/lib/__tests__/habit-reminders.test.ts`

**Interfaces (produces):**
- `parseReminderTime(value: string | undefined): { hour: number; minute: number } | null`
- `formatReminderTime(hour: number, minute: number): string` → `"07:30"`
- `reminderTimeLabel(value: string): string` → `"7:30 AM"`
- `suggestReminderTime(anchorLink: string): string | null` (table from spec §2, first match in table order; `"After I wake up"` exact (case-insensitive, trimmed) → null)
- `withSuggestedReminderTime<T extends { anchorLink: string; reminderTime?: string }>(action: T): T` (fills only when absent and suggestion non-null)
- `interface TimedSlot { fireDate: Date; actions: ElementalAction[] }`
- `planTimedSlots(day: Date, remaining: ElementalAction[], now: Date): TimedSlot[]` — remaining already filtered for weekday/start/completion; keeps only valid `reminderTime`, sorts, coalesces within 15 min of group's first time, drops `fireDate <= now`.
- `fitToBudget<D>(days: D[], countOf: (d: D) => number, max: number): D[]` — keeps whole days in order until adding the next would exceed max.

- [ ] Tests: suggestion (`"After my morning coffee"`→`"07:30"`, `"before bed"`→`"21:30"`, `"at my desk"`→null, `"After I wake up"`→null, `"When I wake up"`→`"07:00"`); parse rejects `"25:00"`, `"7:5"`, `""`; label `"21:30"`→`"9:30 PM"`, `"00:15"`→`"12:15 AM"`; coalescing at 0/14/15/16 min (15 inclusive merges, 16 splits); past slot dropped; untimed excluded; budget keeps whole days and stops at 60; DST week (2026-11-01) slot fires at 07:30 local.
- [ ] Run `npx jest client/lib/__tests__/habit-reminders.test.ts` → FAIL, implement, → PASS. Commit.

### Task 2: Scheduler integration

**Files:** Modify `client/lib/storage.ts` (add `reminderTime?: string` to `ElementalAction`), `client/lib/notifications.ts`; Test `client/lib/__tests__/reminder-schedule.test.ts`

**Interfaces:** consumes Task 1. Produces `HABIT_REMINDER_CATEGORY = "habit-reminder"`; `registerReminderActions()` also registers that category.

- `planReminderDays` returns per day `{ dateKey, day, fireDate, remainingActions (digest: untimed only), timedSlots }`; a day is kept if it has timed slots or digest actions; digest `fireDate` only if digest actions non-empty and in future.
- Apply `fitToBudget(days, d => d.timedSlots.length + (digest ? 1 : 0), 60)`.
- Signature includes each day's timed slots (`fireAt`, `actionIds`) and actions' `reminderTime`.
- Timed content: title = action title (2: `"A + B"`, 3+: `"A + N more"`), body = `The 2-minute version counts: ${kickstartVersion}` truncated; `data: { type, dateKey, actionIds }`; Android channel `daily-reminder`.
- `isDailyReminderRequest` also matches `habit-reminder` type/category.

- [ ] Tests (mock pattern already in file): digest excludes timed habits; no digest when all timed; timed slot cancelled-and-not-rescheduled after log for that habit today; weekday filter; cancel removes both kinds. FAIL → implement → PASS (`npm test`). Commit.

### Task 3: Response handling and suggested times

**Files:** Modify `client/context/AppContext.tsx`, `client/lib/onboarding-plan.ts`, `client/lib/notifications.ts`; tests in existing onboarding-plan tests.

- Listener accepts `daily-reminder` and `habit-reminder`. Default tap: hook credit only for `daily-reminder`; `track("habit_reminder_tap")` for timed. Done: same path (`selectMarkAllDoneActions` with `data.actionIds`), `track("habit_reminder_done")` for timed.
- `addAction` and `approvePlan` pass actions through `withSuggestedReminderTime`.
- Backfill: new context mutator `applySuggestedReminderTimes(): Promise<void>` sets `reminderTime` on active actions lacking one, once (AsyncStorage `evolve_habit_times_backfilled`). Called when reminders are turned on (Profile toggle on, primer accept).
- [ ] Test `approvePlan` sets `reminderTime` from anchor; `"After I wake up"` stays unset. PASS. Commit.

### Task 4: Action editor reminder row

**Files:** Modify `client/screens/ActionEditorScreen.tsx`

- New "Reminder" section after the anchor section: `Switch` + label; when on, iOS renders `DateTimePicker mode="time" display="compact" minuteInterval={5}`; Android a `Pressable` showing the label that opens `DateTimePickerAndroid.open`.
- State `reminderTime: string | null`, initial `existingAction?.reminderTime ?? (isEditing ? null : suggestReminderTime(anchorLink))`; until the user touches the time, editing the anchor on a new habit re-suggests. Switch on with no time uses suggestion or `"08:00"`.
- Save passes `reminderTime ?? undefined` (edit and add). Haptic selection on toggle.
- Hint: on → "You'll get a nudge at 7:30 AM on scheduled days, only if it's still open."; off → "Off. This habit is included in your daily reminder." If notifications disabled: append "Turn on reminders in Settings to get this."
- [ ] `npm run check:types` and `npm run lint` clean. Commit.

### Task 5: Release prep and verification

- [ ] `app.json` `expo.version` → `1.6.0`; `npm run format` on touched files.
- [ ] `npm run check:types && npm run lint && npm test` all green.
- [ ] Whole-branch review by a fresh reviewer; fix findings.
- [ ] Simulator: `npm run build:local:sim`, install, set a habit 2 min out, confirm notification arrives with "Done ✓", tap Done, Today shows it complete.
- [ ] Commit, push branch, PR. Local `npm run build:local:ios`, upload (Organizer fallback per signing landmine), prepare 1.6.0 in App Store Connect. Submit for review only with Brett's explicit go.
