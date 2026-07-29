export const PLAN_TUNE_UP_WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export const PLAN_TUNE_UP_FACTORS = [
  "energy",
  "time",
  "support",
  "environment",
  "plan-fit",
] as const;

export type PlanTuneUpWeekday = (typeof PLAN_TUNE_UP_WEEKDAYS)[number];
export type PlanTuneUpFactor = (typeof PLAN_TUNE_UP_FACTORS)[number];

export interface PlanTuneUpActionSettings {
  title: string;
  frequency: PlanTuneUpWeekday[];
  anchorLink: string;
  kickstartVersion: string;
}

export type EditablePlanSettings = Pick<
  PlanTuneUpActionSettings,
  "frequency" | "anchorLink" | "kickstartVersion"
>;

export interface PlanTuneUpEvidence {
  windowDays: 28;
  scheduled: number;
  completed: number;
  full: number;
  kickstart: number;
  weekdays: {
    day: PlanTuneUpWeekday;
    scheduled: number;
    completed: number;
  }[];
  factors: {
    factor: PlanTuneUpFactor;
    helped: number;
    hindered: number;
  }[];
}

export interface PlanTuneUpRequest {
  consent: true;
  action: PlanTuneUpActionSettings;
  evidence: PlanTuneUpEvidence;
}

export interface PlanTuneUpResponse {
  summary: string;
  changes: Partial<EditablePlanSettings>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isBoundedInteger(value: unknown, maximum: number): value is number {
  return (
    Number.isInteger(value) && Number(value) >= 0 && Number(value) <= maximum
  );
}

function validFrequency(value: unknown): value is PlanTuneUpWeekday[] {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > PLAN_TUNE_UP_WEEKDAYS.length ||
    new Set(value).size !== value.length
  ) {
    return false;
  }
  return value.every((day) =>
    PLAN_TUNE_UP_WEEKDAYS.includes(day as PlanTuneUpWeekday),
  );
}

export function validatePlanTuneUpRequest(value: unknown): string | null {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["consent", "action", "evidence"]) ||
    value.consent !== true
  ) {
    return "Plan Tune-Up requires explicit AI consent and a bounded request.";
  }
  const action = value.action;
  if (
    !isRecord(action) ||
    !hasOnlyKeys(action, [
      "title",
      "frequency",
      "anchorLink",
      "kickstartVersion",
    ]) ||
    typeof action.title !== "string" ||
    action.title.trim().length < 2 ||
    action.title.length > 200 ||
    !validFrequency(action.frequency) ||
    typeof action.anchorLink !== "string" ||
    action.anchorLink.length > 300 ||
    typeof action.kickstartVersion !== "string" ||
    action.kickstartVersion.trim().length < 2 ||
    action.kickstartVersion.length > 300
  ) {
    return "Plan Tune-Up contains invalid action settings.";
  }
  const evidence = value.evidence;
  if (
    !isRecord(evidence) ||
    !hasOnlyKeys(evidence, [
      "windowDays",
      "scheduled",
      "completed",
      "full",
      "kickstart",
      "weekdays",
      "factors",
    ]) ||
    evidence.windowDays !== 28 ||
    !isBoundedInteger(evidence.scheduled, 28) ||
    !isBoundedInteger(evidence.completed, 28) ||
    !isBoundedInteger(evidence.full, 28) ||
    !isBoundedInteger(evidence.kickstart, 28) ||
    Number(evidence.completed) > Number(evidence.scheduled) ||
    Number(evidence.full) + Number(evidence.kickstart) !==
      Number(evidence.completed) ||
    !Array.isArray(evidence.weekdays) ||
    evidence.weekdays.length !== PLAN_TUNE_UP_WEEKDAYS.length ||
    !Array.isArray(evidence.factors) ||
    evidence.factors.length !== PLAN_TUNE_UP_FACTORS.length
  ) {
    return "Plan Tune-Up contains invalid aggregate evidence.";
  }

  const weekdayNames = new Set<string>();
  let weekdayScheduled = 0;
  let weekdayCompleted = 0;
  for (const entry of evidence.weekdays) {
    if (
      !isRecord(entry) ||
      !hasOnlyKeys(entry, ["day", "scheduled", "completed"]) ||
      !PLAN_TUNE_UP_WEEKDAYS.includes(entry.day as PlanTuneUpWeekday) ||
      weekdayNames.has(String(entry.day)) ||
      !isBoundedInteger(entry.scheduled, 4) ||
      !isBoundedInteger(entry.completed, 4) ||
      Number(entry.completed) > Number(entry.scheduled)
    ) {
      return "Plan Tune-Up contains invalid weekday aggregates.";
    }
    weekdayNames.add(String(entry.day));
    weekdayScheduled += Number(entry.scheduled);
    weekdayCompleted += Number(entry.completed);
  }
  if (
    weekdayScheduled !== Number(evidence.scheduled) ||
    weekdayCompleted !== Number(evidence.completed)
  ) {
    return "Plan Tune-Up weekday aggregates do not match the totals.";
  }

  const factorNames = new Set<string>();
  for (const entry of evidence.factors) {
    if (
      !isRecord(entry) ||
      !hasOnlyKeys(entry, ["factor", "helped", "hindered"]) ||
      !PLAN_TUNE_UP_FACTORS.includes(entry.factor as PlanTuneUpFactor) ||
      factorNames.has(String(entry.factor)) ||
      !isBoundedInteger(entry.helped, 28) ||
      !isBoundedInteger(entry.hindered, 28) ||
      Number(entry.helped) + Number(entry.hindered) > Number(evidence.scheduled)
    ) {
      return "Plan Tune-Up contains invalid factor aggregates.";
    }
    factorNames.add(String(entry.factor));
  }
  return null;
}

function sameFrequency(
  first: readonly string[],
  second: readonly string[],
): boolean {
  const weekdayIndex = (day: string) =>
    PLAN_TUNE_UP_WEEKDAYS.indexOf(day as PlanTuneUpWeekday);
  const sortedFirst = [...first].sort(
    (a, b) => weekdayIndex(a) - weekdayIndex(b),
  );
  const sortedSecond = [...second].sort(
    (a, b) => weekdayIndex(a) - weekdayIndex(b),
  );
  return (
    sortedFirst.length === sortedSecond.length &&
    sortedFirst.every((value, index) => value === sortedSecond[index])
  );
}

export function normalizePlanTuneUpResponse(
  value: unknown,
  current: PlanTuneUpActionSettings,
): PlanTuneUpResponse {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["summary", "changes"]) ||
    typeof value.summary !== "string" ||
    !isRecord(value.changes) ||
    !hasOnlyKeys(value.changes, ["frequency", "anchorLink", "kickstartVersion"])
  ) {
    throw new Error("The coach returned an unsupported plan proposal.");
  }
  const summary = value.summary
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, 400);
  if (summary.length < 8) {
    throw new Error("The coach returned an incomplete plan proposal.");
  }

  const changes: Partial<EditablePlanSettings> = {};
  if (value.changes.frequency !== undefined) {
    if (!validFrequency(value.changes.frequency)) {
      throw new Error("The coach returned an invalid schedule.");
    }
    if (!sameFrequency(value.changes.frequency, current.frequency)) {
      changes.frequency = [...value.changes.frequency].sort(
        (first, second) =>
          PLAN_TUNE_UP_WEEKDAYS.indexOf(first) -
          PLAN_TUNE_UP_WEEKDAYS.indexOf(second),
      );
    }
  }
  if (value.changes.anchorLink !== undefined) {
    if (typeof value.changes.anchorLink !== "string") {
      throw new Error("The coach returned an invalid anchor.");
    }
    const anchorLink = value.changes.anchorLink
      .replace(/[\r\n]+/g, " ")
      .trim()
      .slice(0, 300);
    if (anchorLink.length < 2) {
      throw new Error("The coach returned an invalid anchor.");
    }
    if (anchorLink !== current.anchorLink.trim()) {
      changes.anchorLink = anchorLink;
    }
  }
  if (value.changes.kickstartVersion !== undefined) {
    if (typeof value.changes.kickstartVersion !== "string") {
      throw new Error("The coach returned an invalid kickstart.");
    }
    const kickstartVersion = value.changes.kickstartVersion
      .replace(/[\r\n]+/g, " ")
      .trim()
      .slice(0, 300);
    if (kickstartVersion.length < 2) {
      throw new Error("The coach returned an invalid kickstart.");
    }
    if (kickstartVersion !== current.kickstartVersion.trim()) {
      changes.kickstartVersion = kickstartVersion;
    }
  }
  if (Object.keys(changes).length === 0) {
    throw new Error("The coach did not propose a meaningful change.");
  }
  return { summary, changes };
}
