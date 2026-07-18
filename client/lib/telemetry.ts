import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApiUrl, getAuthHeaders } from "@/lib/query-client";
import { getLocalDateString } from "@/lib/progress";
import { storage } from "@/lib/storage";
import { logger } from "@/lib/logger";

/**
 * Privacy-respecting product telemetry.
 *
 * Records only per-day event COUNTS keyed by the same anonymous device UUID
 * the subscription system already uses — no payloads, no session traces, no
 * PII, nothing finer-grained than a calendar day. Events accumulate locally
 * and flush opportunistically in small batches; a dead network or server
 * silently no-ops. Disclosed in the privacy policy alongside the deviceId.
 */

// The complete funnel vocabulary. Adding an event = adding it here; the
// server accepts any well-formed name, so client and dashboard stay the
// single source of truth for what exists.
export type TelemetryEvent =
  | "app_open"
  | "onboarding_started"
  | "onboarding_completed"
  | "onboarding_declined_ai"
  | "first_action_logged"
  | "action_logged"
  | "day_complete"
  | "milestone_complete"
  | "coach_session_started"
  | "weekly_review_started"
  | "paywall_viewed"
  | "paywall_purchase_success"
  | "paywall_restore_success"
  | "notification_tap"
  | "notification_mark_all_done"
  | "widget_action_logged"
  | "health_auto_vote"
  | "recap_viewed"
  | "recap_shared"
  | "insights_viewed"
  | "shield_earned"
  | "shield_used"
  | "reward_unlocked"
  | "coach_observation_opened"
  | "micro_note_read";

const QUEUE_KEY = "telemetryQueue";
const LAST_FLUSH_KEY = "telemetryLastFlush";
const FLUSH_MIN_INTERVAL_MS = 15 * 60 * 1000;
const MAX_BATCH = 50;

type QueueShape = Record<string, number>; // "YYYY-MM-DD|event" -> count

let memoryQueue: QueueShape | null = null;
let persistChain: Promise<void> = Promise.resolve();

async function loadQueue(): Promise<QueueShape> {
  if (memoryQueue) return memoryQueue;
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    memoryQueue = raw ? (JSON.parse(raw) as QueueShape) : {};
  } catch {
    memoryQueue = {};
  }
  return memoryQueue;
}

function persistQueue(): void {
  // Serialize writes so rapid track() calls can't interleave stale snapshots.
  persistChain = persistChain.then(async () => {
    try {
      if (memoryQueue) {
        await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(memoryQueue));
      }
    } catch (error) {
      logger.error("telemetry persist failed", error);
    }
  });
}

/** Count one occurrence of an event on today's (device-local) date. */
export function track(event: TelemetryEvent): void {
  void (async () => {
    try {
      const queue = await loadQueue();
      const key = `${getLocalDateString(new Date())}|${event}`;
      queue[key] = (queue[key] ?? 0) + 1;
      persistQueue();
    } catch (error) {
      logger.error("telemetry track failed", error);
    }
  })();
}

/**
 * Push pending counts to the server. Throttled to one attempt per 15 minutes
 * unless `force` — call on app start/foreground; failures keep the queue.
 */
export async function flushTelemetry(force = false): Promise<void> {
  try {
    if (!force) {
      const last = await AsyncStorage.getItem(LAST_FLUSH_KEY);
      if (last && Date.now() - Number(last) < FLUSH_MIN_INTERVAL_MS) return;
    }
    const queue = await loadQueue();
    const keys = Object.keys(queue);
    if (keys.length === 0) return;

    const batchKeys = keys.slice(0, MAX_BATCH);
    const events = batchKeys.map((key) => {
      const [day, event] = key.split("|");
      return { day, event, count: queue[key] };
    });
    const deviceId = await storage.getDeviceId();

    const res = await fetch(new URL("/api/telemetry", getApiUrl()).toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ deviceId, events }),
    });
    await AsyncStorage.setItem(LAST_FLUSH_KEY, String(Date.now()));
    if (res.ok) {
      for (const key of batchKeys) delete queue[key];
      persistQueue();
      // Backlog larger than one batch (e.g. after several offline days): drain
      // the rest now instead of one 50-key batch per 15-minute throttle window.
      if (keys.length > MAX_BATCH) {
        await flushTelemetry(true);
      }
    }
  } catch (error) {
    // Offline or server down: counts stay queued for the next flush.
    logger.error("telemetry flush failed", error);
  }
}
