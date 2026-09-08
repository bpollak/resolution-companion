import AsyncStorage from "@react-native-async-storage/async-storage";

import type { DailyLog, ElementalAction, Reflection } from "@/lib/storage";
import { getLocalDateString } from "@/lib/progress";

// One-time free taste of coach memory: memory sells itself by demonstration,
// not description. Set once a session has actually started with it in play.
const MEMORY_TASTE_USED_KEY = "coach_memory_taste_used";

export async function getMemoryTasteUsed(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(MEMORY_TASTE_USED_KEY)) === "true";
  } catch {
    // Unknown state must not hand out extra tastes
    return true;
  }
}

export async function markMemoryTasteUsed(): Promise<void> {
  await AsyncStorage.setItem(MEMORY_TASTE_USED_KEY, "true").catch(() => {});
}

/**
 * Premium coach memory: a compact digest of the two most recent saved
 * sessions, injected into the system prompt as the coach's own notes.
 * Free sessions stay single-session — this is what "unlimited coaching"
 * buys beyond quantity: a coach that remembers.
 */
export function buildPreviousSessionNotes(
  reflections: Reflection[],
): string | undefined {
  const trim = (s: string, n: number) =>
    s.length > n ? `${s.slice(0, n).trimEnd()}…` : s;
  const notes = [...reflections]
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .slice(0, 2)
    .map((r) => {
      let firstUser = "";
      let lastCoach = "";
      try {
        const convo = r.conversation
          ? (JSON.parse(r.conversation) as { role: string; content: string }[])
          : [];
        firstUser = convo.find((m) => m.role === "user")?.content ?? "";
        lastCoach =
          [...convo].reverse().find((m) => m.role === "assistant")?.content ??
          "";
      } catch {
        // Legacy sessions stored split fields only
      }
      if (!firstUser) firstUser = r.userInput?.split("\n")[0] ?? "";
      if (!lastCoach) lastCoach = r.aiFeedback?.split("\n").slice(-1)[0] ?? "";
      const when = new Date(r.createdAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      const kind = r.periodType === "weekly" ? "weekly review" : "check-in";
      return `- ${when} (${kind}, momentum ${r.momentumScore}%): they opened with "${trim(firstUser, 200)}" and you closed with "${trim(lastCoach, 280)}"`;
    });
  return notes.length > 0 ? notes.join("\n") : undefined;
}

/**
 * The user's own completion notes from the last 7 days — the coach quoting
 * their words back is the "it knows me" moment. Newest first, capped at 8.
 */
export function buildRecentNotes(
  actions: ElementalAction[],
  dailyLogs: DailyLog[],
  today: Date = new Date(),
): string | undefined {
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - 7);
  cutoff.setHours(0, 0, 0, 0);
  const titleById = new Map(actions.map((a) => [a.id, a.title]));
  const lines = dailyLogs
    .filter((l) => l.status && l.note)
    .filter((l) => {
      const [y, m, d] = l.logDate.split("T")[0].split("-").map(Number);
      return new Date(y, m - 1, d) >= cutoff;
    })
    .sort((a, b) => (a.logDate < b.logDate ? 1 : -1))
    .slice(0, 8)
    .map((l) => {
      const [y, m, d] = l.logDate.split("T")[0].split("-").map(Number);
      const when = new Date(y, m - 1, d).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      const title = titleById.get(l.actionId) ?? "an action";
      return `- ${when} · ${title}: "${l.note}"`;
    });
  return lines.length > 0 ? lines.join("\n") : undefined;
}

/** Compact, action-level evidence for practical coaching suggestions. */
export function buildCoachActionContext(
  actions: ElementalAction[],
  logs: DailyLog[],
  today: Date = new Date(),
): string | undefined {
  if (actions.length === 0) return undefined;

  const end = new Date(today);
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - 13);
  const logIndex = new Map(
    logs.map((log) => [`${log.actionId}|${log.logDate.split("T")[0]}`, log]),
  );

  return actions
    .slice(0, 5)
    .map((action) => {
      let scheduled = 0;
      let completed = 0;
      const createdKey = getLocalDateString(new Date(action.createdAt));
      const cursor = new Date(start);
      while (cursor <= end) {
        const dateKey = getLocalDateString(cursor);
        const weekday = cursor.toLocaleDateString("en-US", { weekday: "long" });
        if (
          dateKey >= createdKey &&
          action.frequency.includes(weekday) &&
          dateKey !== getLocalDateString(end)
        ) {
          scheduled++;
          if (logIndex.get(`${action.id}|${dateKey}`)?.status) completed++;
        }
        cursor.setDate(cursor.getDate() + 1);
      }
      return `- ${action.title}: ${completed}/${scheduled} scheduled days completed; 2-minute version: ${action.kickstartVersion}; routine anchor: ${action.anchorLink}`;
    })
    .join("\n");
}
