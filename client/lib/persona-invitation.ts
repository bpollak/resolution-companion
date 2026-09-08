import type { DailyLog, ElementalAction, Persona } from "@/lib/storage";
import {
  buildLogIndex,
  computeMomentumScore,
  getLocalDateString,
} from "@/lib/progress";

export const SECOND_PERSONA_INVITE_SEEN_KEY =
  "second_persona_invite_seen_month";

export function getMonthKey(date: Date): string {
  return getLocalDateString(date).slice(0, 7);
}

/**
 * A quiet expansion invitation after one identity has genuinely taken root.
 * It is not a generic upsell: one-persona users need 30 days of history and
 * at least 70% rolling consistency, and dismissal suppresses it for a month.
 */
export function shouldOfferSecondPersona(
  personas: Persona[],
  activePersona: Persona | null,
  actions: ElementalAction[],
  logs: DailyLog[],
  seenMonth: string | null,
  now: Date = new Date(),
): boolean {
  if (!activePersona || personas.length !== 1 || actions.length === 0)
    return false;
  if (seenMonth === getMonthKey(now)) return false;

  const createdAt = new Date(activePersona.createdAt).getTime();
  const ageDays = Math.floor((now.getTime() - createdAt) / 86_400_000);
  if (!Number.isFinite(ageDays) || ageDays < 30) return false;

  return (
    computeMomentumScore(actions, logs, 30, buildLogIndex(logs), now) >= 70
  );
}
