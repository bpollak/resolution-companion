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
  MARK_ALL_DONE_ACTION,
} from "@/lib/notifications";
import * as Notifications from "expo-notifications";
import { logger } from "@/lib/logger";

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

  // Derived from the persona-scoped state, so they can never drift from the
  // data they describe (state mirrors storage via refreshData + mutators)
  const progressSnapshot = useMemo(
    () => buildProgressSnapshot(actions, dailyLogs, benchmarks),
    [actions, dailyLogs, benchmarks],
  );
  const { momentumScore, personaAlignment } = progressSnapshot;
  const [subscription, setSubscriptionState] = useState<Subscription>({
    isPremium: false,
    plan: "free",
    expiresAt: null,
    purchasedAt: null,
  });
  const [monthlyReflectionCount, setMonthlyReflectionCount] = useState(0);
  const [aiConsent, setAiConsentState] = useState(false);
  const [milestoneCelebration, setMilestoneCelebration] =
    useState<Benchmark | null>(null);
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
      (async () => {
        const updated = await updateBenchmark(benchmark.id, {
          status: "completed",
        });
        const raw = await AsyncStorage.getItem(MILESTONE_CELEBRATION_SEEN_KEY);
        let seen: string[] = [];
        try {
          seen = raw ? JSON.parse(raw) : [];
        } catch {
          seen = [];
        }
        if (seen.includes(benchmark.id)) return;
        await AsyncStorage.setItem(
          MILESTONE_CELEBRATION_SEEN_KEY,
          JSON.stringify([...seen, benchmark.id]),
        );
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
  }, []);

  // Reminder-chain self-heal: a suppressed night (one-shot queued for
  // "tomorrow") followed by days of absence leaves no repeating reminder.
  // Every app foreground restores the chain — idempotent and cheap, a no-op
  // unless reminders are enabled and the schedule is actually stale.
  const reminderStateRef = useRef({ hasOnboarded, actions, dailyLogs });
  useEffect(() => {
    reminderStateRef.current = { hasOnboarded, actions, dailyLogs };
  });
  useEffect(() => {
    if (Platform.OS === "web") return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      const {
        hasOnboarded: onboarded,
        actions: currentActions,
        dailyLogs: currentLogs,
      } = reminderStateRef.current;
      if (!onboarded) return;
      ensureReminderScheduled({
        streakCount: computeStreak(currentActions, currentLogs).current,
        missedRun: computeLapse(currentActions, currentLogs).missedDays,
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
      if (response.actionIdentifier !== MARK_ALL_DONE_ACTION) return;
      const data = response.notification.request.content.data as
        | { type?: string }
        | undefined;
      if (data?.type !== "daily-reminder") return;

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
