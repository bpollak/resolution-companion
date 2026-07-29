export const DAILY_CONTEXT_FACTORS = [
  "energy",
  "time",
  "support",
  "environment",
  "plan-fit",
] as const;

export type DailyContextFactor = (typeof DAILY_CONTEXT_FACTORS)[number];

export interface DailyContextEntry {
  id: string;
  personaId: string;
  logDate: string;
  helped: DailyContextFactor[];
  hindered: DailyContextFactor[];
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DailyContextInput {
  logDate: string;
  helped: DailyContextFactor[];
  hindered: DailyContextFactor[];
  note?: string;
}

export const DAILY_CONTEXT_FACTOR_LABELS: Record<DailyContextFactor, string> = {
  energy: "Energy",
  time: "Time",
  support: "Support",
  environment: "Environment",
  "plan-fit": "Plan fit",
};

const DAY_MS = 24 * 60 * 60 * 1000;
const factorSet = new Set<string>(DAILY_CONTEXT_FACTORS);

function epochDay(dateKey: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) throw new Error("Daily context requires a valid local date.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const value = Date.UTC(year, month - 1, day);
  const parsed = new Date(value);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error("Daily context requires a valid local date.");
  }
  return Math.floor(value / DAY_MS);
}

function normalizeFactors(values: DailyContextFactor[]): DailyContextFactor[] {
  const unique = [...new Set(values)];
  if (unique.some((value) => !factorSet.has(value))) {
    throw new Error("Daily context contains an unsupported factor.");
  }
  return unique;
}

export function normalizeDailyContextInput(
  input: DailyContextInput,
): DailyContextInput {
  epochDay(input.logDate);
  const helped = normalizeFactors(input.helped);
  const hindered = normalizeFactors(input.hindered);
  if (helped.some((factor) => hindered.includes(factor))) {
    throw new Error("A factor cannot both help and hinder on the same day.");
  }
  const trimmed = input.note?.trim().slice(0, 200) ?? "";
  if (helped.length === 0 && hindered.length === 0 && trimmed.length === 0) {
    throw new Error("Choose a factor or add a short note before saving.");
  }
  return {
    logDate: input.logDate,
    helped,
    hindered,
    note: trimmed.length > 0 ? trimmed : undefined,
  };
}

export function isWithinDailyContextBackfill(
  dateKey: string,
  todayKey: string,
  previousDays = 7,
): boolean {
  const difference = epochDay(todayKey) - epochDay(dateKey);
  return difference >= 0 && difference <= previousDays;
}

export function formatDailyContextSummary(
  entry: Pick<DailyContextEntry, "helped" | "hindered" | "note">,
): string {
  const parts = [
    ...entry.helped.map(
      (factor) => `${DAILY_CONTEXT_FACTOR_LABELS[factor]} helped`,
    ),
    ...entry.hindered.map(
      (factor) => `${DAILY_CONTEXT_FACTOR_LABELS[factor]} got in the way`,
    ),
  ];
  if (entry.note) parts.push("Note saved");
  return parts.join(" · ");
}
