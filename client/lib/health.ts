import { Platform } from "react-native";
import { ElementalAction } from "@/lib/storage";
import { logger } from "@/lib/logger";

/**
 * Apple Health auto-votes: a workout, step total, or mindful session
 * recorded in Health automatically completes a matching action — the
 * "never take a zero" floor extended to effort the phone already saw.
 * HealthKit reads happen on-device, so this stays local-first.
 *
 * The native module is absent in Expo Go and on Android/web; every entry
 * point degrades to a no-op there.
 */

// Steps needed for a "steps" auto-complete day
export const HEALTH_STEPS_THRESHOLD = 7000;

type HealthKitModule = {
  initHealthKit: (
    permissions: unknown,
    callback: (error: string | null) => void,
  ) => void;
  getStepCount: (
    options: { date: string },
    callback: (error: string | null, result: { value: number } | null) => void,
  ) => void;
  getSamples: (
    options: { startDate: string; endDate: string; type: string },
    callback: (error: string | null, result: unknown[] | null) => void,
  ) => void;
  getMindfulSession: (
    options: { startDate: string; endDate: string },
    callback: (error: string | null, result: unknown[] | null) => void,
  ) => void;
  Constants?: { Permissions?: Record<string, string> };
};

let healthKit: HealthKitModule | null = null;
if (Platform.OS === "ios") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("react-native-health");
    healthKit = (mod?.default ?? mod) as HealthKitModule;
    if (typeof healthKit?.initHealthKit !== "function") healthKit = null;
  } catch {
    healthKit = null;
  }
}

export function isHealthAvailable(): boolean {
  return healthKit !== null;
}

let initialized = false;

/** Request read access for the three auto-vote categories. */
export async function initHealth(): Promise<boolean> {
  if (!healthKit) return false;
  if (initialized) return true;
  const perms = healthKit.Constants?.Permissions;
  const permissions = {
    permissions: {
      read: [
        perms?.Steps ?? "Steps",
        perms?.StepCount ?? "StepCount",
        perms?.Workout ?? "Workout",
        perms?.MindfulSession ?? "MindfulSession",
      ],
      write: [],
    },
  };
  return new Promise((resolve) => {
    healthKit!.initHealthKit(permissions, (error) => {
      if (error) {
        logger.error("HealthKit init failed:", error);
        resolve(false);
        return;
      }
      initialized = true;
      resolve(true);
    });
  });
}

function dayRange(date: Date): { startDate: string; endDate: string } {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { startDate: start.toISOString(), endDate: end.toISOString() };
}

/** Whether Health data satisfies the given auto-complete kind for `date`. */
export async function isHealthGoalMet(
  kind: NonNullable<ElementalAction["healthAutoComplete"]>,
  date: Date = new Date(),
): Promise<boolean> {
  if (!healthKit || !initialized) return false;
  const range = dayRange(date);
  try {
    if (kind === "steps") {
      return await new Promise((resolve) => {
        healthKit!.getStepCount({ date: range.startDate }, (error, result) =>
          resolve(!error && (result?.value ?? 0) >= HEALTH_STEPS_THRESHOLD),
        );
      });
    }
    if (kind === "workout") {
      return await new Promise((resolve) => {
        healthKit!.getSamples({ ...range, type: "Workout" }, (error, result) =>
          resolve(!error && Array.isArray(result) && result.length > 0),
        );
      });
    }
    return await new Promise((resolve) => {
      healthKit!.getMindfulSession(range, (error, result) =>
        resolve(!error && Array.isArray(result) && result.length > 0),
      );
    });
  } catch (error) {
    logger.error("Health goal check failed:", error);
    return false;
  }
}

export const HEALTH_KIND_LABELS: Record<
  NonNullable<ElementalAction["healthAutoComplete"]>,
  string
> = {
  workout: "Any workout logged in Health",
  steps: `${HEALTH_STEPS_THRESHOLD.toLocaleString()}+ steps`,
  mindful: "Any mindful session",
};
