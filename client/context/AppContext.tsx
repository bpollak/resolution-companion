import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  ReactNode,
} from "react";
import { AppState, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  storage,
  generateStorageId,
  Persona,
  Benchmark,
  ElementalAction,
  DailyLog,
  Reflection,
  Subscription,
} from "@/lib/storage";
import {
  buildProgressSnapshot,
  computeLapse,
  computeStreak,
  getLocalDateString,
  ProgressSnapshot,
} from "@/lib/progress";
import {
  ensureReminderScheduled,
  registerReminderActions,
  recordReminderHookTap,
  MARK_ALL_DONE_ACTION,
} from "@/lib/notifications";
import * as Notifications from "expo-notifications";
import { logger } from "@/lib/logger";
import { track, flushTelemetry } from "@/lib/telemetry";
import { getApiUrl, getAuthHeaders } from "@/lib/query-client";
import { syncWidgetData, consumePendingVotes } from "@/lib/widget";
import { unlockRewardsForMilestoneCount, Reward } from "@/lib/rewards";
import { isHealthAvailable, initHealth, isHealthGoalMet } from "@/lib/health";

interface AppContextType {
  hasOnboarded: boolean;
  persona: Persona | null;
  personas: Persona[];
  benchmarks: Benchmark[];
  actions: ElementalAction[];
  dailyLogs: DailyLog[];
  reflections: Reflection[];
  momentumScore: number;
  personaAlignment: number;
  progressSnapshot: ProgressSnapshot;
  isLoading: boolean;
  subscription: Subscription;
  monthlyReflectionCount: number;
  aiConsent: boolean;
  /** Milestone that just flipped to completed and hasn't been celebrated yet. */
  milestoneCelebration: Benchmark | null;
  /** Reward newly unlocked by that milestone, revealed in the celebration. */
  celebrationReward: Reward | null;
  dismissMilestoneCelebration: () => void;

  setHasOnboarded: (value: boolean) => Promise<void>;
  setAiConsent: (value: boolean) => Promise<void>;
  setPersona: (persona: Omit<Persona, "id" | "createdAt">) => Promise<Persona>;
  addPersona: (persona: Omit<Persona, "id" | "createdAt">) => Promise<Persona>;
  switchPersona: (id: string) => Promise<void>;
  deletePersona: (id: string) => Promise<void>;
  addBenchmark: (
    benchmark: Omit<Benchmark, "id" | "createdAt">,
  ) => Promise<Benchmark>;
  updateBenchmark: (
    id: string,
    updates: Partial<Omit<Benchmark, "id" | "createdAt">>,
  ) => Promise<Benchmark | null>;
  deleteBenchmark: (id: string) => Promise<void>;
  setBenchmarks: (benchmarks: Benchmark[]) => Promise<void>;
  addAction: (
    action: Omit<ElementalAction, "id" | "createdAt">,
  ) => Promise<ElementalAction>;
  updateAction: (
    id: string,
    updates: Partial<Omit<ElementalAction, "id" | "createdAt">>,
  ) => Promise<ElementalAction | null>;
  deleteAction: (id: string) => Promise<void>;
  setActions: (actions: ElementalAction[]) => Promise<void>;
  toggleDailyLog: (actionId: string, date: string) => Promise<DailyLog>;
  setDailyLogNote: (
    actionId: string,
    date: string,
    note: string,
  ) => Promise<void>;
  addReflection: (
    reflection: Omit<Reflection, "id" | "createdAt">,
  ) => Promise<Reflection>;
  refreshData: () => Promise<void>;
  clearAllData: () => Promise<void>;
  upgradeToPremium: (plan: "monthly" | "yearly") => Promise<void>;
  incrementReflectionCount: () => Promise<number>;
  canUseReflection: () => boolean;
  canAddPersona: () => boolean;
  canAddBenchmark: () => boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const FREE_REFLECTION_LIMIT = 10;

// Milestone ids whose completion celebration has already been shown — each
// milestone is celebrated exactly once, ever (survives restarts)
const MILESTONE_CELEBRATION_SEEN_KEY = "milestone_celebration_seen_ids";

export function AppProvider({ children }: { children: ReactNode }) {
  const [hasOnboarded, setHasOnboardedState] = useState(false);
  const [persona, setPersonaState] = useState<Persona | null>(null);
  const [personas, setPersonasState] = useState<Persona[]>([]);
  const [benchmarks, setBenchmarksState] = useState<Benchmark[]>([]);
  const [actions, setActionsState] = useState<ElementalAction[]>([]);
  const [dailyLogs, setDailyLogsState] = useState<DailyLog[]>([]);
  const [reflections, setReflectionsState] = useState<Reflection[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [subscription, setSubscriptionState] = useState<Subscription>({
    isPremium: false,
    plan: "free",
    expiresAt: null,
    purchasedAt: null,
  });
  // Derived from the persona-scoped state, so they can never drift from the
  // data they describe (state mirrors storage via refreshData + mutators).
  // Premium holds 2 streak shields — extra grace, earned the same way.
  const progressSnapshot = useMemo(
    () =>
      buildProgressSnapshot(actions, dailyLogs, benchmarks, {
        maxShields: subscription.isPremium ? 2 : 1,
      }),
    [actions, dailyLogs, benchmarks, subscription.isPremium],
  );
  const { momentumScore, personaAlignment } = progressSnapshot;
  const [monthlyReflectionCount, setMonthlyReflectionCount] = useState(0);
  const [aiConsent, setAiConsentState] = useState(false);
  const [milestoneCelebration, setMilestoneCelebration] =
    useState<Benchmark | null>(null);
  const [celebrationReward, setCelebrationReward] = useState<Reward | null>(
    null,
  );
  // Ids already being flipped this session, so the effect below can't fire
  // twice for the same milestone while an update is in flight
  const milestoneFlipsInFlight = useRef<Set<string>>(new Set());

  const refreshData = useCallback(async () => {
    try {
      const [
        onboarded,
        personaData,
        personasData,
        benchmarksData,
        actionsData,
        logsData,
        reflectionsData,
        subscriptionData,
        reflectionCountData,
        aiConsentData,
      ] = await Promise.all([
        storage.getHasOnboarded(),
        storage.getActivePersona(),
        storage.getPersonas(),
        storage.getBenchmarks(),
        storage.getElementalActions(),
        storage.getDailyLogs(),
        storage.getReflections(),
        storage.getSubscription(),
        storage.getMonthlyReflectionCount(),
        storage.getAiConsent(),
      ]);

      setSubscriptionState(subscriptionData);
      setMonthlyReflectionCount(reflectionCountData.count);
      setAiConsentState(aiConsentData);

      setHasOnboardedState(onboarded);
      setPersonaState(personaData);
      setPersonasState(personasData);

      if (personaData) {
        const personaBenchmarks = benchmarksData.filter(
          (b) => b.personaId === personaData.id,
        );
        const personaBenchmarkIds = personaBenchmarks.map((b) => b.id);
        const personaActions = actionsData.filter((a) =>
          personaBenchmarkIds.includes(a.benchmarkId),
        );
        const personaActionIds = personaActions.map((a) => a.id);
        const personaLogs = logsData.filter((l) =>
          personaActionIds.includes(l.actionId),
        );

        setBenchmarksState(personaBenchmarks);
        setActionsState(personaActions);
        setDailyLogsState(personaLogs);
      } else {
        setBenchmarksState([]);
        setActionsState([]);
        setDailyLogsState([]);
      }
      setReflectionsState(reflectionsData);
    } catch (error) {
      logger.error("Error refreshing data:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // Cold-start telemetry + entitlement re-sync. Both are fire-and-forget:
  // offline keeps local truth, and neither can delay first render.
  useEffect(() => {
    if (Platform.OS === "web") return;
    track("app_open");
    flushTelemetry().catch(() => {});

    // The paywall path already persists server-validated expiry, but nothing
    // re-checked it afterwards — an expired subscription stayed premium
    // locally until the user happened to open the paywall. Reconcile once per
    // launch. Conservative on downgrade: the server may legitimately lack a
    // row (validation raced, webhook missed), so local premium is only revoked
    // when the server disagrees AND the locally-known period has lapsed.
    (async () => {
      try {
        const local = await storage.getSubscription();
        const deviceId = await storage.getDeviceId();
        const res = await fetch(
          new URL(
            `/api/subscription/status/${deviceId}`,
            getApiUrl(),
          ).toString(),
          { headers: getAuthHeaders() },
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          isPremium: boolean;
          plan: string;
          currentPeriodEnd: string | null;
        };
        if (data.isPremium) {
          const next: Subscription = {
            isPremium: true,
            plan:
              data.plan === "yearly" || data.plan === "monthly"
                ? data.plan
                : local.plan,
            expiresAt: data.currentPeriodEnd ?? local.expiresAt,
            purchasedAt: local.purchasedAt,
          };
          if (
            next.isPremium !== local.isPremium ||
            next.plan !== local.plan ||
            next.expiresAt !== local.expiresAt
          ) {
            await storage.setSubscription(next);
            setSubscriptionState(next);
          }
        } else if (
          local.isPremium &&
          local.expiresAt &&
          new Date(local.expiresAt).getTime() < Date.now()
        ) {
          const next: Subscription = {
            isPremium: false,
            plan: "free",
            expiresAt: local.expiresAt,
            purchasedAt: local.purchasedAt,
          };
          await storage.setSubscription(next);
          setSubscriptionState(next);
        }
      } catch {
        // Offline or server unreachable — keep local state.
      }
    })();
  }, []);

  // All mutators are memoized (and the provider value below is useMemo'd):
  // an unmemoized value object re-renders every consumer screen on every
  // state change, which made tab navigation feel sluggish.
  const setHasOnboarded = useCallback(async (value: boolean) => {
    await storage.setHasOnboarded(value);
    setHasOnboardedState(value);
  }, []);

  const setAiConsent = useCallback(async (value: boolean) => {
    await storage.setAiConsent(value);
    setAiConsentState(value);
  }, []);

  const setPersona = useCallback(
    async (personaData: Omit<Persona, "id" | "createdAt">) => {
      const newPersona = await storage.setPersona(personaData);
      setPersonaState(newPersona);
      const allPersonas = await storage.getPersonas();
      setPersonasState(allPersonas);
      return newPersona;
    },
    [],
  );

  const addPersona = useCallback(
    async (personaData: Omit<Persona, "id" | "createdAt">) => {
      const newPersona = await storage.addPersona(personaData);
      setPersonaState(newPersona);
      const allPersonas = await storage.getPersonas();
      setPersonasState(allPersonas);
      return newPersona;
    },
    [],
  );

  const switchPersona = useCallback(
    async (id: string) => {
      await storage.setActivePersonaId(id);
      await refreshData();
    },
    [refreshData],
  );

  const deletePersona = useCallback(
    async (id: string) => {
      setBenchmarksState([]);
      setActionsState([]);
      setDailyLogsState([]);
      await storage.deletePersona(id);
      await refreshData();
    },
    [refreshData],
  );

  const addBenchmark = useCallback(
    async (benchmark: Omit<Benchmark, "id" | "createdAt">) => {
      const newBenchmark = await storage.addBenchmark(benchmark);
      setBenchmarksState((prev) => [...prev, newBenchmark]);
      return newBenchmark;
    },
    [],
  );

  const setBenchmarks = useCallback(async (benchmarksData: Benchmark[]) => {
    await storage.setBenchmarks(benchmarksData);
    setBenchmarksState(benchmarksData);
  }, []);

  const updateBenchmark = useCallback(
    async (
      id: string,
      updates: Partial<Omit<Benchmark, "id" | "createdAt">>,
    ) => {
      const updated = await storage.updateBenchmark(id, updates);
      if (updated) {
        setBenchmarksState((prev) =>
          prev.map((b) => (b.id === id ? updated : b)),
        );
      }
      return updated;
    },
    [],
  );

  const deleteBenchmark = useCallback(async (id: string) => {
    // Read actions from storage rather than the closure so the id list is
    // never stale (this callback is intentionally dependency-free)
    const currentActions = await storage.getElementalActions();
    const actionIdsToDelete = currentActions
      .filter((a) => a.benchmarkId === id)
      .map((a) => a.id);
    await storage.deleteBenchmark(id);
    setBenchmarksState((prev) => prev.filter((b) => b.id !== id));
    setActionsState((prev) => prev.filter((a) => a.benchmarkId !== id));
    setDailyLogsState((prev) =>
      prev.filter((l) => !actionIdsToDelete.includes(l.actionId)),
    );
  }, []);

  const addAction = useCallback(
    async (action: Omit<ElementalAction, "id" | "createdAt">) => {
      const newAction = await storage.addElementalAction(action);
      setActionsState((prev) => [...prev, newAction]);
      return newAction;
    },
    [],
  );

  const updateAction = useCallback(
    async (
      id: string,
      updates: Partial<Omit<ElementalAction, "id" | "createdAt">>,
    ) => {
      const updated = await storage.updateElementalAction(id, updates);
      if (updated) {
        setActionsState((prev) => prev.map((a) => (a.id === id ? updated : a)));
      }
      return updated;
    },
    [],
  );

  const deleteAction = useCallback(async (id: string) => {
    await storage.deleteElementalAction(id);
    setActionsState((prev) => prev.filter((a) => a.id !== id));
    setDailyLogsState((prev) => prev.filter((l) => l.actionId !== id));
  }, []);

  const setActions = useCallback(async (actionsData: ElementalAction[]) => {
    await storage.setElementalActions(actionsData);
    setActionsState(actionsData);
  }, []);

  // Optimistic: the ring/streak/chips must respond on the same frame as the
  // tap. State is computed and applied synchronously; the AsyncStorage write
  // happens behind it on a FIFO queue (upsertDailyLog). Both toggle surfaces
  // (Today, Calendar) only operate on the active persona's actions, so the
  // persona-scoped state invariant holds.
  const dailyLogsRef = useRef(dailyLogs);
  dailyLogsRef.current = dailyLogs;
  const toggleDailyLog = useCallback(
    async (actionId: string, date: string) => {
      const dateStr = date.includes("T") ? date.split("T")[0] : date;
      const existing = dailyLogsRef.current.find((l) => {
        const logDateStr = l.logDate.includes("T")
          ? l.logDate.split("T")[0]
          : l.logDate;
        return l.actionId === actionId && logDateStr === dateStr;
      });
      const log: DailyLog = existing
        ? { ...existing, status: !existing.status }
        : {
            id: generateStorageId(),
            actionId,
            logDate: dateStr,
            status: true,
            createdAt: new Date().toISOString(),
          };
      if (log.status) {
        if (!dailyLogsRef.current.some((l) => l.status)) {
          track("first_action_logged");
        }
        track("action_logged");
      }
      setDailyLogsState((prev) =>
        prev.some((l) => l.id === log.id)
          ? prev.map((l) => (l.id === log.id ? log : l))
          : [...prev, log],
      );
      storage.upsertDailyLog(log).catch(() => {
        // Persist failed — reload persisted truth so the UI doesn't drift
        refreshData();
      });
      return log;
    },
    [refreshData],
  );

  // Attach/replace the one-line "how it went" note on an existing completed
  // log. Notes ride on the log itself so they surface anywhere the log does
  // (Journey day detail) and feed the coach's context.
  const setDailyLogNote = useCallback(
    async (actionId: string, date: string, note: string) => {
      const dateStr = date.includes("T") ? date.split("T")[0] : date;
      const existing = dailyLogsRef.current.find((l) => {
        const logDateStr = l.logDate.includes("T")
          ? l.logDate.split("T")[0]
          : l.logDate;
        return l.actionId === actionId && logDateStr === dateStr;
      });
      if (!existing || !existing.status) return;
      const trimmed = note.trim().slice(0, 200);
      const updated: DailyLog = {
        ...existing,
        note: trimmed.length > 0 ? trimmed : undefined,
      };
      setDailyLogsState((prev) =>
        prev.map((l) => (l.id === updated.id ? updated : l)),
      );
      storage.upsertDailyLog(updated).catch(() => {
        refreshData();
      });
    },
    [refreshData],
  );

  const addReflection = useCallback(
    async (reflection: Omit<Reflection, "id" | "createdAt">) => {
      const newReflection = await storage.addReflection(reflection);
      setReflectionsState((prev) => [...prev, newReflection]);
      return newReflection;
    },
    [],
  );

  const clearAllData = useCallback(async () => {
    await storage.clearAll();
    setHasOnboardedState(false);
    setPersonaState(null);
    setPersonasState([]);
    setBenchmarksState([]);
    setActionsState([]);
    setDailyLogsState([]);
    setReflectionsState([]);
    setSubscriptionState({
      isPremium: false,
      plan: "free",
      expiresAt: null,
      purchasedAt: null,
    });
    setMonthlyReflectionCount(0);
    setAiConsentState(false);
  }, []);

  const upgradeToPremium = useCallback(async (plan: "monthly" | "yearly") => {
    const now = new Date();
    const expiresAt = new Date(now);
    if (plan === "monthly") {
      expiresAt.setMonth(expiresAt.getMonth() + 1);
    } else {
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    }
    const newSubscription: Subscription = {
      isPremium: true,
      plan,
      expiresAt: expiresAt.toISOString(),
      purchasedAt: now.toISOString(),
    };
    await storage.setSubscription(newSubscription);
    setSubscriptionState(newSubscription);
  }, []);

  const incrementReflectionCountFn = useCallback(async () => {
    const count = await storage.incrementReflectionCount();
    setMonthlyReflectionCount(count);
    return count;
  }, []);

  // Milestones are fill-only consistency targets: once a benchmark's action
  // has been completed on enough scheduled days, flip its (previously dead)
  // status field to "completed". Runs whenever logs change, converges after
  // one pass, and never flips completed milestones back — progress only fills.
  // Legacy benchmarks stored without a status are treated as active.
  // A fresh flip also queues the one-time celebration moment (seen ids are
  // persisted, so a milestone is never celebrated twice).
  useEffect(() => {
    if (isLoading) return;
    for (const benchmark of benchmarks) {
      if (benchmark.status === "completed") continue;
      const completed =
        progressSnapshot.milestoneProgressByBenchmarkId.get(benchmark.id)
          ?.completed ?? false;
      if (!completed || milestoneFlipsInFlight.current.has(benchmark.id)) {
        continue;
      }
      milestoneFlipsInFlight.current.add(benchmark.id);
      track("milestone_complete");
      (async () => {
        const updated = await updateBenchmark(benchmark.id, {
          status: "completed",
        });
        // Dedup FIRST: if this milestone was already celebrated, bail before
        // unlocking/persisting a reward — otherwise an edge-triggered re-flip
        // silently consumes the reward and the celebration is never shown.
        const raw = await AsyncStorage.getItem(MILESTONE_CELEBRATION_SEEN_KEY);
        let seen: string[] = [];
        try {
          seen = raw ? JSON.parse(raw) : [];
        } catch {
          seen = [];
        }
        if (seen.includes(benchmark.id)) return;
        // Rewards key off the lifetime completed count across ALL personas
        // (read from storage post-write, so this flip is included)
        const allBenchmarks = await storage.getBenchmarks();
        const completedCount = allBenchmarks.filter(
          (b) => b.status === "completed",
        ).length;
        const newRewards = await unlockRewardsForMilestoneCount(completedCount);
        await AsyncStorage.setItem(
          MILESTONE_CELEBRATION_SEEN_KEY,
          JSON.stringify([...seen, benchmark.id]),
        );
        if (newRewards.length > 0) {
          track("reward_unlocked");
          setCelebrationReward(newRewards[0]);
        }
        setMilestoneCelebration(
          updated ?? { ...benchmark, status: "completed" },
        );
      })().catch((error) => {
        milestoneFlipsInFlight.current.delete(benchmark.id);
        logger.error("Failed to mark milestone completed:", error);
      });
    }
  }, [isLoading, benchmarks, progressSnapshot, updateBenchmark]);

  const dismissMilestoneCelebration = useCallback(() => {
    setMilestoneCelebration(null);
    setCelebrationReward(null);
  }, []);

  // Reminder-chain self-heal: a suppressed night (one-shot queued for
  // "tomorrow") followed by days of absence leaves no repeating reminder.
  // Every app foreground restores the chain — idempotent and cheap, a no-op
  // unless reminders are enabled and the schedule is actually stale.
  const reminderStateRef = useRef({
    hasOnboarded,
    actions,
    dailyLogs,
    persona,
    personaAlignment,
    isLoading,
  });
  useEffect(() => {
    reminderStateRef.current = {
      hasOnboarded,
      actions,
      dailyLogs,
      persona,
      personaAlignment,
      isLoading,
    };
  });
  useEffect(() => {
    if (Platform.OS === "web") return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      flushTelemetry().catch(() => {});
      const {
        hasOnboarded: onboarded,
        actions: currentActions,
        dailyLogs: currentLogs,
      } = reminderStateRef.current;
      if (!onboarded) return;
      ensureReminderScheduled({
        streakCount: computeStreak(currentActions, currentLogs).current,
        missedRun: computeLapse(currentActions, currentLogs).missedDays,
        personaName: reminderStateRef.current.persona?.name,
        monthlyConsistency: reminderStateRef.current.personaAlignment,
      });
    });
    return () => subscription.remove();
  }, []);

  // "Mark all done ✓" quick action on the daily reminder. The response can
  // arrive live (listener) or on the next launch (last-response) when iOS ran
  // the action without waking JS — the handled-key guard makes the two paths
  // idempotent. Logs are written for the notification's FIRE date, so a tap
  // on last night's reminder processed this morning still credits yesterday.
  useEffect(() => {
    if (Platform.OS === "web") return;
    registerReminderActions();

    const handleResponse = async (
      response: Notifications.NotificationResponse | null,
    ) => {
      if (!response) return;
      const data = response.notification.request.content.data as
        | { type?: string; hook?: string }
        | undefined;
      if (data?.type !== "daily-reminder") return;
      // A plain tap opened the app from the reminder: credit the voice that
      // earned it so the hook portfolio learns what this user responds to.
      // getLastNotificationResponseAsync replays the same response on every
      // launch, so the credit is deduped with a persisted marker (same
      // pattern as the mark-all-done guard below).
      if (
        response.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER
      ) {
        const tapMarker = `${response.notification.request.identifier}|${response.notification.date}`;
        try {
          const tapHandledKey = "evolve_reminder_tap_handled";
          if ((await AsyncStorage.getItem(tapHandledKey)) === tapMarker) {
            return;
          }
          await AsyncStorage.setItem(tapHandledKey, tapMarker);
        } catch {
          // Guard failed open — an over-count nudges the portfolio, nothing more.
        }
        track("notification_tap");
        recordReminderHookTap(data.hook).catch(() => {});
        return;
      }
      if (response.actionIdentifier !== MARK_ALL_DONE_ACTION) return;

      const firedAt = new Date(response.notification.date);
      const dateKey = getLocalDateString(firedAt);
      const handledKey = `evolve_reminder_action_handled`;
      const marker = `${response.notification.request.identifier}|${dateKey}`;
      try {
        if ((await AsyncStorage.getItem(handledKey)) === marker) return;
        await AsyncStorage.setItem(handledKey, marker);
      } catch {
        // Guard failed open — a duplicate pass is harmless (toggles below
        // skip already-completed actions).
      }

      track("notification_mark_all_done");
      const { actions: currentActions, dailyLogs: currentLogs } =
        reminderStateRef.current;
      const weekday = firedAt.toLocaleDateString("en-US", { weekday: "long" });
      for (const action of currentActions) {
        if (!action.frequency.includes(weekday)) continue;
        const created = getLocalDateString(new Date(action.createdAt));
        if (created > dateKey) continue;
        const existing = currentLogs.find(
          (l) =>
            l.actionId === action.id && l.logDate.split("T")[0] === dateKey,
        );
        if (existing?.status) continue;
        await toggleDailyLog(action.id, dateKey);
      }
    };

    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        handleResponse(response).catch((error) =>
          logger.error("Failed to handle reminder action:", error),
        );
      },
    );
    Notifications.getLastNotificationResponseAsync()
      .then(handleResponse)
      .catch(() => {});
    return () => subscription.remove();
  }, [toggleDailyLog]);

  // Keep the home/lock-screen widget's snapshot in step with the store, and
  // fold in votes cast from the widget while the app was closed. Widget taps
  // only ever complete (never un-complete): a queued vote for an action the
  // user has since completed in-app is dropped, not toggled.
  useEffect(() => {
    if (Platform.OS !== "ios" || isLoading) return;
    for (const vote of consumePendingVotes()) {
      const existing = dailyLogsRef.current.find(
        (l) =>
          l.actionId === vote.actionId && l.logDate.split("T")[0] === vote.date,
      );
      if (existing?.status) continue;
      if (!actions.some((a) => a.id === vote.actionId)) continue;
      track("widget_action_logged");
      toggleDailyLog(vote.actionId, vote.date).catch((error) =>
        logger.error("Failed to apply widget vote:", error),
      );
    }
    syncWidgetData(actions, dailyLogs, persona);
  }, [isLoading, actions, dailyLogs, persona, toggleDailyLog]);

  // Widget votes cast while the app stayed backgrounded (state changes don't
  // fire above): reconcile on every foreground. Never consume before the
  // store has loaded — iOS fires an 'active' event right at launch, and
  // reading votes against the still-empty action list would silently drop
  // them (found in simulator regression: the injected pending vote vanished
  // without completing anything).
  useEffect(() => {
    if (Platform.OS !== "ios") return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      if (reminderStateRef.current.isLoading) return;
      const { actions: currentActions } = reminderStateRef.current;
      for (const vote of consumePendingVotes()) {
        const existing = dailyLogsRef.current.find(
          (l) =>
            l.actionId === vote.actionId &&
            l.logDate.split("T")[0] === vote.date,
        );
        if (existing?.status) continue;
        if (!currentActions.some((a) => a.id === vote.actionId)) continue;
        track("widget_action_logged");
        toggleDailyLog(vote.actionId, vote.date).catch((error) =>
          logger.error("Failed to apply widget vote:", error),
        );
      }
    });
    return () => subscription.remove();
  }, [toggleDailyLog]);

  // Apple Health auto-votes: actions opted into Health auto-completion get
  // their vote cast when a matching sample exists for today. Runs once per
  // foreground; a cast vote flows through the normal optimistic toggle, so
  // rings, streaks, and the widget all update the same way a tap would.
  const healthCheckDoneRef = useRef(false);
  useEffect(() => {
    if (Platform.OS !== "ios" || isLoading || !isHealthAvailable()) return;

    const runHealthAutoVotes = async () => {
      const { actions: currentActions } = reminderStateRef.current;
      const today = new Date();
      const todayStr = getLocalDateString(today);
      const weekday = today.toLocaleDateString("en-US", { weekday: "long" });
      const candidates = currentActions.filter((action) => {
        if (!action.healthAutoComplete) return false;
        if (!action.frequency.includes(weekday)) return false;
        if (getLocalDateString(new Date(action.createdAt)) > todayStr)
          return false;
        const existing = dailyLogsRef.current.find(
          (l) =>
            l.actionId === action.id && l.logDate.split("T")[0] === todayStr,
        );
        return !existing?.status;
      });
      if (candidates.length === 0) return;
      if (!(await initHealth())) return;
      for (const action of candidates) {
        if (await isHealthGoalMet(action.healthAutoComplete!, today)) {
          track("health_auto_vote");
          await toggleDailyLog(action.id, todayStr);
        }
      }
    };

    if (!healthCheckDoneRef.current) {
      healthCheckDoneRef.current = true;
      runHealthAutoVotes().catch((error) =>
        logger.error("Health auto-vote failed:", error),
      );
    }
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      runHealthAutoVotes().catch((error) =>
        logger.error("Health auto-vote failed:", error),
      );
    });
    return () => subscription.remove();
  }, [isLoading, toggleDailyLog]);

  const canUseReflection = useCallback(() => {
    if (subscription.isPremium) return true;
    return monthlyReflectionCount < FREE_REFLECTION_LIMIT;
  }, [subscription.isPremium, monthlyReflectionCount]);

  const canAddPersona = useCallback(() => {
    if (subscription.isPremium) return true;
    return personas.length < 1;
  }, [subscription.isPremium, personas.length]);

  const canAddBenchmark = useCallback(() => {
    return subscription.isPremium;
  }, [subscription.isPremium]);

  const value = useMemo(
    () => ({
      hasOnboarded,
      persona,
      personas,
      benchmarks,
      actions,
      dailyLogs,
      reflections,
      momentumScore,
      personaAlignment,
      progressSnapshot,
      isLoading,
      subscription,
      monthlyReflectionCount,
      aiConsent,
      milestoneCelebration,
      celebrationReward,
      dismissMilestoneCelebration,
      setHasOnboarded,
      setAiConsent,
      setPersona,
      addPersona,
      switchPersona,
      deletePersona,
      addBenchmark,
      updateBenchmark,
      deleteBenchmark,
      setBenchmarks,
      addAction,
      updateAction,
      deleteAction,
      setActions,
      toggleDailyLog,
      setDailyLogNote,
      addReflection,
      refreshData,
      clearAllData,
      upgradeToPremium,
      incrementReflectionCount: incrementReflectionCountFn,
      canUseReflection,
      canAddPersona,
      canAddBenchmark,
    }),
    [
      hasOnboarded,
      persona,
      personas,
      benchmarks,
      actions,
      dailyLogs,
      reflections,
      momentumScore,
      personaAlignment,
      progressSnapshot,
      isLoading,
      subscription,
      monthlyReflectionCount,
      aiConsent,
      milestoneCelebration,
      celebrationReward,
      dismissMilestoneCelebration,
      setHasOnboarded,
      setAiConsent,
      setPersona,
      addPersona,
      switchPersona,
      deletePersona,
      addBenchmark,
      updateBenchmark,
      deleteBenchmark,
      setBenchmarks,
      addAction,
      updateAction,
      deleteAction,
      setActions,
      toggleDailyLog,
      setDailyLogNote,
      addReflection,
      refreshData,
      clearAllData,
      upgradeToPremium,
      incrementReflectionCountFn,
      canUseReflection,
      canAddPersona,
      canAddBenchmark,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
}
