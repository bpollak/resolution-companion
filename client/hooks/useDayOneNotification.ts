import { useEffect, useState } from "react";
import { AppState, Platform } from "react-native";
import {
  getNotificationPermissionState,
  syncDayOneNotification,
} from "@/lib/notifications";
import { logger } from "@/lib/logger";

/**
 * Keeps the day-one notification matched to the active plan's start and
 * reports whether notifications are denied (only Settings can change that).
 *
 * Runs on mount, when the start or the local date changes, and on every
 * return to the foreground: the start can change without this screen seeing
 * a save (a restored backup, a switched plan), and permission changes only
 * in the Settings app, outside this one.
 */
export function useDayOneNotification(
  planStartsAt: string | null | undefined,
  /** False until stored data has loaded, so a cold start cancels nothing. */
  ready: boolean,
  dateKey: string,
): boolean {
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (!ready || Platform.OS === "web") return;
    let active = true;
    const run = () => {
      syncDayOneNotification(planStartsAt)
        .then(getNotificationPermissionState)
        .then((state) => {
          if (active) setDenied(state === "denied");
        })
        .catch((error) => {
          logger.error("Failed to refresh the day-one notification:", error);
        });
    };
    run();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") run();
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [planStartsAt, ready, dateKey]);

  return denied;
}
