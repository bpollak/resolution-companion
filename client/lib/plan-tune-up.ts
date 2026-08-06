import type {
  DailyContextEntry,
  DailyContextFactor,
  DailyLog,
  ElementalAction,
  PlanAdjustmentChanges,
} from "@/lib/storage";
import { getApiUrl, getAuthHeaders } from "@/lib/query-client";
import { getLocalDateString } from "@/lib/progress";
import { storage } from "@/lib/storage";

const FACTORS: DailyContextFactor[] = [
  "energy",
  "time",
  "support",
  "environment",
  "planFit",
];

export interface PlanTuneUpActionInput {
  slot: number;
  frequency: string[];
  anchorLink: string;
  kickstartVersion: string;
  scheduled: number;
  completed: number;
  kickstarts: number;
  factors: Record<DailyContextFactor, { helped: number; hindered: number }>;
}

export interface PlanTuneUpRequest {
  daysActive: number;
  monthlyConsistency: number;
  actions: PlanTuneUpActionInput[];
}

export interface PlanTuneUpSuggestion {
  slot: number;
  changes: PlanAdjustmentChanges;
  rationale: string;
}

const WEEKDAYS = new Set([
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
]);
const ALLOWED_CHANGE_KEYS = new Set([
  "frequency",
  "anchorLink",
  "kickstartVersion",
]);

export function parsePlanTuneUpSuggestion(
  payload: unknown,
  request: PlanTuneUpRequest,
): PlanTuneUpSuggestion {
  if (!payload || typeof payload !== "object") {
    throw new Error("The coach returned an invalid plan suggestion.");
  }
  const candidate = payload as Record<string, unknown>;
  const changes = candidate.changes;
  if (
    !Number.isInteger(candidate.slot) ||
    typeof candidate.slot !== "number" ||
    !request.actions.some((action) => action.slot === candidate.slot) ||
    !changes ||
    typeof changes !== "object" ||
    Array.isArray(changes) ||
    typeof candidate.rationale !== "string" ||
    candidate.rationale.trim().length < 1 ||
    candidate.rationale.length > 500
  ) {
    throw new Error("The coach returned an invalid plan suggestion.");
  }
  const entries = Object.entries(changes);
  if (
    entries.length === 0 ||
    entries.some(([key]) => !ALLOWED_CHANGE_KEYS.has(key))
  ) {
    throw new Error("The coach returned an invalid plan suggestion.");
  }
  const typed = changes as PlanAdjustmentChanges;
  if (
    typed.frequency !== undefined &&
    (!Array.isArray(typed.frequency) ||
      typed.frequency.length < 1 ||
      typed.frequency.length > 7 ||
      typed.frequency.some((day) => !WEEKDAYS.has(day)))
  ) {
    throw new Error("The coach returned an invalid plan suggestion.");
  }
  for (const value of [typed.anchorLink, typed.kickstartVersion]) {
    if (
      value !== undefined &&
      (typeof value !== "string" ||
        value.trim().length < 1 ||
        value.length > 200)
    ) {
      throw new Error("The coach returned an invalid plan suggestion.");
    }
  }
  const current = request.actions.find(
    (action) => action.slot === candidate.slot,
  )!;
  const actuallyChanged = Object.entries(typed).some(([key, next]) => {
    const previous = current[key as keyof PlanTuneUpActionInput];
    return Array.isArray(previous) && Array.isArray(next)
      ? previous.join("|") !== next.join("|")
      : previous !== next;
  });
  if (!actuallyChanged) {
    throw new Error("The coach returned an invalid plan suggestion.");
  }
  return {
    slot: candidate.slot,
    changes: typed,
    rationale: candidate.rationale,
  };
}

export function buildPlanTuneUpRequest(input: {
  actions: ElementalAction[];
  logs: DailyLog[];
  /** Legacy daily-context entries; the capture UI was removed 2026-08-06,
   * so tallies are zero for new requests. Field kept for server compat. */
  contextEntries?: DailyContextEntry[];
  personaCreatedAt: string;
  monthlyConsistency: number;
  today?: Date;
}): PlanTuneUpRequest {
  const today = input.today ?? new Date();
  const end = new Date(today);
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() - 1);
  const start = new Date(end);
  start.setDate(start.getDate() - 27);
  const index = new Map(
    input.logs.map((log) => [
      `${log.actionId}|${log.logDate.split("T")[0]}`,
      log,
    ]),
  );
  const savedContext = (input.contextEntries ?? []).filter(
    (entry) => entry.status === "saved",
  );

  const actions = input.actions.slice(0, 5).map((action, slot) => {
    let scheduled = 0;
    let completed = 0;
    let kickstarts = 0;
    const created = getLocalDateString(new Date(action.createdAt));
    const cursor = new Date(start);
    while (cursor <= end) {
      const dateKey = getLocalDateString(cursor);
      const weekday = cursor.toLocaleDateString("en-US", { weekday: "long" });
      if (dateKey >= created && action.frequency.includes(weekday)) {
        scheduled += 1;
        const log = index.get(`${action.id}|${dateKey}`);
        if (log?.status) completed += 1;
        if (log?.status && log.completionKind === "kickstart") kickstarts += 1;
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    const factors = Object.fromEntries(
      FACTORS.map((factor) => [
        factor,
        {
          helped: savedContext.filter(
            (entry) => entry.factors[factor] === "helped",
          ).length,
          hindered: savedContext.filter(
            (entry) => entry.factors[factor] === "hindered",
          ).length,
        },
      ]),
    ) as PlanTuneUpActionInput["factors"];
    return {
      slot,
      frequency: action.frequency,
      anchorLink: action.anchorLink,
      kickstartVersion: action.kickstartVersion,
      scheduled,
      completed,
      kickstarts,
      factors,
    };
  });
  const createdAt = new Date(input.personaCreatedAt).getTime();
  return {
    daysActive: Math.max(
      0,
      Math.floor((today.getTime() - createdAt) / 86_400_000),
    ),
    monthlyConsistency: Math.max(0, Math.min(100, input.monthlyConsistency)),
    actions,
  };
}

export async function requestPlanTuneUp(
  request: PlanTuneUpRequest,
  signal?: AbortSignal,
): Promise<PlanTuneUpSuggestion> {
  const response = await fetch(
    new URL("/api/plan-tune-up", getApiUrl()).toString(),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Device-Id": await storage.getDeviceId(),
        ...getAuthHeaders(),
      },
      body: JSON.stringify(request),
      signal,
    },
  );
  if (!response.ok)
    throw new Error("Plan guidance is temporarily unavailable.");
  return parsePlanTuneUpSuggestion(await response.json(), request);
}
