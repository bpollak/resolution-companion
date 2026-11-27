export type NotificationPermissionState = "granted" | "denied" | "undetermined";

export const REMINDER_SETTINGS_HINT = "Turn on in Settings";

/**
 * What the Daily Reminders switch should show. The stored "enabled" flag is
 * only the person's wish; the system permission decides whether anything can
 * fire. Denied means the app can no longer ask, so the only way on is the
 * Settings app, and the row says so instead of showing a switch that lies.
 */
export function reminderSwitchDisplay(input: {
  enabled: boolean;
  permission: NotificationPermissionState;
}): { on: boolean; needsSettings: boolean; hint: string | null } {
  const needsSettings = input.permission === "denied";
  return {
    on: input.enabled && input.permission === "granted",
    needsSettings,
    hint: needsSettings ? REMINDER_SETTINGS_HINT : null,
  };
}
