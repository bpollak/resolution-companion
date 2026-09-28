// Fixed allowlist — mirrors the TelemetryEvent union in client/lib/telemetry.ts.
// Free-form event names would let a caller with the (extractable) app key mint
// unbounded distinct rows; keying rows by (deviceId, day, event) means the only
// way to bound table growth is to bound the event and day dimensions here.
// Never remove a name: installed builds keep sending the events they shipped with.
export const TELEMETRY_EVENTS: ReadonlySet<string> = new Set<string>([
  "app_open",
  "onboarding_started",
  "onboarding_completed",
  "onboarding_declined_ai",
  "first_action_logged",
  "action_logged",
  "day_complete",
  "milestone_complete",
  "coach_session_started",
  "weekly_review_started",
  "paywall_viewed",
  "paywall_purchase_success",
  "paywall_restore_success",
  "notification_tap",
  "notification_mark_all_done",
  "widget_action_logged",
  "health_auto_vote",
  "recap_viewed",
  "recap_shared",
  "insights_viewed",
  "shield_earned",
  "shield_used",
  "reward_unlocked",
  "coach_observation_opened",
  "today_signal_actioned",
  "daily_context_saved",
  "daily_context_dismissed",
  "story_archive_opened",
  "evidence_timeline_opened",
  "context_pattern_viewed",
  "coach_sheet_opened",
  "coach_context_prompt_sent",
  "coach_context_session_saved",
  "journey_discovery_opened",
  "coach_response_helpful",
  "coach_response_unhelpful",
  "plan_tune_up_requested",
  "plan_tune_up_applied",
  "plan_tuneup_previewed",
  "plan_tuneup_applied",
  "plan_tuneup_dismissed",
  "micro_note_read",
  "year_recap_shared",
  "witness_progress_shared",
  "icloud_backup_created",
  "icloud_backup_restored",
  "client_error",
]);

export type TelemetryEntry = { day: string; event: string; count: number };

export const TELEMETRY_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// Reject semantically-bogus days (e.g. 9999-99-99) and anything outside a sane
// recent window, so `day` can't be used as an unbounded distinct-row dimension.
export function isValidTelemetryDay(day: string, now = Date.now()): boolean {
  if (!TELEMETRY_DAY_RE.test(day)) return false;
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  )
    return false;
  const ms = dt.getTime();
  // clean-slate app; no real telemetry predates 2024, allow ~2d future for TZ skew
  return ms >= Date.UTC(2024, 0, 1) && ms <= now + 2 * 86_400_000;
}

// Returns the entries to store, or null when the batch is malformed. An event
// name this server doesn't know is dropped rather than failing the batch: the
// app only clears its queue on a 2xx, so one unknown name from a newer build
// would otherwise block that device's telemetry forever.
export function acceptTelemetryEvents(
  events: unknown[],
  now = Date.now(),
): TelemetryEntry[] | null {
  const accepted: TelemetryEntry[] = [];
  for (const entry of events as Partial<TelemetryEntry>[]) {
    if (
      !entry ||
      typeof entry.event !== "string" ||
      typeof entry.day !== "string" ||
      !isValidTelemetryDay(entry.day, now) ||
      typeof entry.count !== "number" ||
      !Number.isInteger(entry.count) ||
      entry.count < 1 ||
      entry.count > 1000
    ) {
      return null;
    }
    if (TELEMETRY_EVENTS.has(entry.event)) {
      accepted.push({ day: entry.day, event: entry.event, count: entry.count });
    }
  }
  return accepted;
}
