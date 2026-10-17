import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { getLocalDateString } from "@/lib/progress";

/**
 * Today's local date key ("YYYY-MM-DD"), updated at local midnight and when
 * the app returns to the foreground. Tabs stay mounted and nothing else
 * re-renders them on a date change, so without this an app left in the
 * background overnight would log the morning's check-offs to yesterday.
 */
export function useLocalDateKey(): string {
  const [dateKey, setDateKey] = useState(() => getLocalDateString(new Date()));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      // Same string → React bails out, so this is free when nothing changed.
      setDateKey(getLocalDateString(new Date()));
      if (timer) clearTimeout(timer);
      const now = new Date();
      const nextMidnight = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() + 1,
      );
      // A second past midnight so the timer never lands a hair early.
      timer = setTimeout(
        refresh,
        nextMidnight.getTime() - now.getTime() + 1000,
      );
    };
    refresh();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    return () => {
      if (timer) clearTimeout(timer);
      subscription.remove();
    };
  }, []);

  return dateKey;
}
