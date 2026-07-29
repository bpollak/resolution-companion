import type { DailyLog, ElementalAction } from "@/lib/storage";
import type { DailyContextEntry } from "@/lib/daily-context";
import { getLocalDateString, sortWeekdays } from "@/lib/progress";
import { getApiUrl, getAuthHeaders } from "@/lib/query-client";
import { storage } from "@/lib/storage";
import {
  normalizePlanTuneUpResponse,
  PLAN_TUNE_UP_FACTORS,
  PLAN_TUNE_UP_WEEKDAYS,
  type PlanTuneUpActionSettings,
  type PlanTuneUpEvidence,
  type PlanTuneUpRequest,
  type PlanTuneUpResponse,
  type PlanTuneUpWeekday,
} from "@shared/plan-tune-up";

function asSettings(action: ElementalAction): PlanTuneUpActionSettings {
  return {
    title: action.title,
    frequency: sortWeekdays(action.frequency) as PlanTuneUpWeekday[],
    anchorLink: action.anchorLink,
    kickstartVersion: action.kickstartVersion,
  };
}

export function buildPlanTuneUpRequest(
  action: ElementalAction,
  logs: DailyLog[],
  contexts: DailyContextEntry[],
  today: Date = new Date(),
): PlanTuneUpRequest {
  const logByDate = new Map(
    logs
      .filter((log) => log.actionId === action.id)
      .map((log) => [log.logDate.split("T")[0], log]),
  );
  const contextByDate = new Map(
    contexts.map((entry) => [entry.logDate, entry]),
  );
  const weekdays: PlanTuneUpEvidence["weekdays"] = PLAN_TUNE_UP_WEEKDAYS.map(
    (day) => ({
      day,
      scheduled: 0,
      completed: 0,
    }),
  );
  const weekdayByName = new Map(weekdays.map((entry) => [entry.day, entry]));
  const factors: PlanTuneUpEvidence["factors"] = PLAN_TUNE_UP_FACTORS.map(
    (factor) => ({ factor, helped: 0, hindered: 0 }),
  );
  const factorByName = new Map(factors.map((entry) => [entry.factor, entry]));

  const end = new Date(today);
  end.setHours(0, 0, 0, 0);
  const cursor = new Date(end);
  cursor.setDate(cursor.getDate() - 27);
  const createdAt = getLocalDateString(new Date(action.createdAt));
  let scheduled = 0;
  let completed = 0;
  let full = 0;
  let kickstart = 0;

  while (cursor <= end) {
    const dateKey = getLocalDateString(cursor);
    const weekday = cursor.toLocaleDateString("en-US", {
      weekday: "long",
    }) as PlanTuneUpWeekday;
    const log = logByDate.get(dateKey);
    if (
      action.frequency.includes(weekday) &&
      (dateKey >= createdAt || log?.status)
    ) {
      scheduled += 1;
      const weekdayAggregate = weekdayByName.get(weekday)!;
      weekdayAggregate.scheduled += 1;
      if (log?.status) {
        completed += 1;
        weekdayAggregate.completed += 1;
        if (log.completionKind === "kickstart") kickstart += 1;
        else full += 1;
      }
      const context = contextByDate.get(dateKey);
      if (context) {
        for (const factor of context.helped) {
          const aggregate = factorByName.get(factor);
          if (aggregate) aggregate.helped += 1;
        }
        for (const factor of context.hindered) {
          const aggregate = factorByName.get(factor);
          if (aggregate) aggregate.hindered += 1;
        }
      }
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return {
    consent: true,
    action: asSettings(action),
    evidence: {
      windowDays: 28,
      scheduled,
      completed,
      full,
      kickstart,
      weekdays,
      factors,
    },
  };
}

export function canRequestPlanTuneUp(request: PlanTuneUpRequest): boolean {
  return request.evidence.scheduled >= 7;
}

export async function requestPlanTuneUp(
  request: PlanTuneUpRequest,
  externalSignal?: AbortSignal,
): Promise<PlanTuneUpResponse> {
  if (!canRequestPlanTuneUp(request)) {
    throw new Error(
      "Plan Tune-Up needs at least seven scheduled action-days first.",
    );
  }
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (externalSignal?.aborted) {
    controller.abort();
  } else {
    externalSignal?.addEventListener("abort", onAbort, { once: true });
  }
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
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
        signal: controller.signal,
      },
    );
    const payload = (await response.json().catch(() => ({}))) as unknown;
    if (!response.ok) {
      const message =
        typeof payload === "object" &&
        payload !== null &&
        "error" in payload &&
        typeof payload.error === "string"
          ? payload.error
          : "Coach could not prepare a Plan Tune-Up.";
      throw new Error(message);
    }
    return normalizePlanTuneUpResponse(payload, request.action);
  } catch (error) {
    if (controller.signal.aborted && !externalSignal?.aborted) {
      throw new Error("Plan Tune-Up timed out. Your plan was not changed.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", onAbort);
  }
}
