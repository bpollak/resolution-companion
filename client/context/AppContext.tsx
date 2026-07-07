import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from "react";
import {
  storage,
  Persona,
  Benchmark,
  ElementalAction,
  DailyLog,
  Reflection,
  Subscription,
} from "@/lib/storage";
import {
  buildLogIndex,
  computeMilestoneProgress,
  computeMomentumScore,
} from "@/lib/progress";
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
  isLoading: boolean;
  subscription: Subscription;
  monthlyReflectionCount: number;
  aiConsent: boolean;

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
  const momentumScore = useMemo(
    () => computeMomentumScore(actions, dailyLogs, 7),
    [actions, dailyLogs],
  );
  // Monthly Consistency: completion % of scheduled actions this calendar
  // month (month-to-date). Resets on the 1st — a deliberate fresh start —
  // and is THE long-arc metric everywhere (the 7-day momentum score above
  // stays internal coach context, not a user-facing headline).
  const personaAlignment = useMemo(
    () => computeMomentumScore(actions, dailyLogs, new Date().getDate()),
    [actions, dailyLogs],
  );
  const [subscription, setSubscriptionState] = useState<Subscription>({
    isPremium: false,
    plan: "free",
    expiresAt: null,
    purchasedAt: null,
  });
  const [monthlyReflectionCount, setMonthlyReflectionCount] = useState(0);
  const [aiConsent, setAiConsentState] = useState(false);

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

  // Upsert into state directly — no storage re-reads. Both toggle surfaces
  // (Today, Calendar) only operate on the active persona's actions, so the
  // persona-scoped state invariant holds. Momentum/alignment recompute via
  // the useMemo above.
  const toggleDailyLog = useCallback(async (actionId: string, date: string) => {
    const log = await storage.toggleDailyLog(actionId, date);
    setDailyLogsState((prev) =>
      prev.some((l) => l.id === log.id)
        ? prev.map((l) => (l.id === log.id ? log : l))
        : [...prev, log],
    );
    return log;
  }, []);

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
  useEffect(() => {
    if (isLoading) return;
    const logIndex = buildLogIndex(dailyLogs);
    for (const benchmark of benchmarks) {
      if (benchmark.status === "completed") continue;
      const { completed } = computeMilestoneProgress(
        benchmark,
        actions,
        logIndex,
      );
      if (completed) {
        updateBenchmark(benchmark.id, { status: "completed" }).catch(
          (error) => {
            logger.error("Failed to mark milestone completed:", error);
          },
        );
      }
    }
  }, [isLoading, benchmarks, actions, dailyLogs, updateBenchmark]);

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
      isLoading,
      subscription,
      monthlyReflectionCount,
      aiConsent,
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
      isLoading,
      subscription,
      monthlyReflectionCount,
      aiConsent,
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
