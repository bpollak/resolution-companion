import type {
  CoachEvidenceSnapshot,
  DailyLog,
  ElementalAction,
} from "@/lib/storage";
import { getLocalDateString } from "@/lib/progress";

export type ActionRhythmCategory =
  | "working-well"
  | "still-forming"
  | "worth-simplifying";

export interface ActionRhythm {
  actionId: string;
  category: ActionRhythmCategory;
  scheduled: number;
  completed: number;
  rate: number;
}

export type TodaySignalKind =
  | "rest"
  | "complete"
  | "reduce-friction"
  | "protect-pattern"
  | "next-action";

export interface TodaySignal {
  id: string;
  kind: TodaySignalKind;
  eyebrow: string;
  headline: string;
  detail: string;
  actionId?: string;
  primaryLabel?: string;
  primaryKind?: "full" | "kickstart" | "journey";
  coachPrompt?: string;
  evidence: CoachEvidenceSnapshot;
}

function logIndex(logs: DailyLog[]): Map<string, DailyLog> {
  return new Map(
    logs.map((log) => [`${log.actionId}|${log.logDate.split("T")[0]}`, log]),
  );
}

export function categorizeActionRhythms(
  actions: ElementalAction[],
  logs: DailyLog[],
  today: Date = new Date(),
): ActionRhythm[] {
  const index = logIndex(logs);
  const end = new Date(today);
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() - 1);
  const start = new Date(end);
  start.setDate(start.getDate() - 27);

  return actions.map((action) => {
    let scheduled = 0;
    let completed = 0;
    const created = getLocalDateString(new Date(action.createdAt));
    const cursor = new Date(start);
    while (cursor <= end) {
      const dateKey = getLocalDateString(cursor);
      const weekday = cursor.toLocaleDateString("en-US", { weekday: "long" });
      if (dateKey >= created && action.frequency.includes(weekday)) {
        scheduled += 1;
        if (index.get(`${action.id}|${dateKey}`)?.status) completed += 1;
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    const rate = scheduled > 0 ? Math.round((completed / scheduled) * 100) : 0;
    const category: ActionRhythmCategory =
      scheduled < 4
        ? "still-forming"
        : rate >= 70
          ? "working-well"
          : rate < 40
            ? "worth-simplifying"
            : "still-forming";
    return { actionId: action.id, category, scheduled, completed, rate };
  });
}

export function computeTodaySignal(input: {
  personaName: string;
  todayKey: string;
  todayActions: ElementalAction[];
  completedActionIds: Set<string>;
  missedDays: number;
  coachObservation?: { id: string; text: string } | null;
}): TodaySignal {
  const {
    personaName,
    todayKey,
    todayActions,
    completedActionIds,
    missedDays,
    coachObservation,
  } = input;
  const pending = todayActions.filter(
    (action) => !completedActionIds.has(action.id),
  );
  const baseEvidence = (
    headline: string,
    detail: string,
  ): CoachEvidenceSnapshot => ({
    eyebrow: "Today’s signal",
    headline,
    detail,
    value: `${completedActionIds.size}/${todayActions.length}`,
  });

  if (todayActions.length === 0) {
    const headline = "Recovery is part of the plan";
    const detail =
      "Nothing is scheduled today. Rest, or take a look at tomorrow when you are ready.";
    return {
      id: `rest-${todayKey}`,
      kind: "rest",
      eyebrow: "Today’s focus",
      headline,
      detail,
      primaryLabel: "Prepare for tomorrow",
      primaryKind: "journey",
      evidence: baseEvidence(headline, detail),
    };
  }
  if (pending.length === 0) {
    const headline = `${personaName} showed up today`;
    const detail = `You completed all ${todayActions.length} scheduled action${todayActions.length === 1 ? "" : "s"}. That is real evidence, banked.`;
    return {
      id: `complete-${todayKey}`,
      kind: "complete",
      eyebrow: "Today’s evidence",
      headline,
      detail,
      coachPrompt: "Help me reflect on what made today work.",
      evidence: baseEvidence(headline, detail),
    };
  }
  const action = pending[0];
  if (missedDays >= 2) {
    const headline = "Make the plan smaller, not the promise";
    const detail = `Try the two-minute version: ${action.kickstartVersion}`;
    return {
      id: `friction-${action.id}-${todayKey}`,
      kind: "reduce-friction",
      eyebrow: "A gentler restart",
      headline,
      detail,
      actionId: action.id,
      primaryLabel: "Do the 2-minute version",
      primaryKind: "kickstart",
      coachPrompt: `Help me make “${action.title}” easier to restart.`,
      evidence: baseEvidence(headline, detail),
    };
  }
  if (coachObservation) {
    return {
      id: coachObservation.id,
      kind: "protect-pattern",
      eyebrow: "Your coach noticed",
      headline: "Something is starting to stick",
      detail: coachObservation.text,
      primaryLabel: "See the pattern",
      primaryKind: "journey",
      coachPrompt: "Help me understand what is making this pattern work.",
      evidence: baseEvidence(
        "Something is starting to stick",
        coachObservation.text,
      ),
    };
  }
  const headline = `Start with ${action.title}`;
  const detail = `One action is enough to put ${personaName} in motion.`;
  return {
    id: `next-${action.id}-${todayKey}`,
    kind: "next-action",
    eyebrow: "Up next",
    headline,
    detail,
    actionId: action.id,
    primaryLabel: "Complete this action",
    primaryKind: "full",
    coachPrompt: `Help me get started with “${action.title}” today.`,
    evidence: baseEvidence(headline, detail),
  };
}
