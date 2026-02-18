import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { storage, Persona, Benchmark, ElementalAction, DailyLog, Reflection, Subscription } from "@/lib/storage";

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
  
  setHasOnboarded: (value: boolean) => Promise<void>;
  setPersona: (persona: Omit<Persona, "id" | "createdAt">) => Promise<Persona>;
  addPersona: (persona: Omit<Persona, "id" | "createdAt">) => Promise<Persona>;
  switchPersona: (id: string) => Promise<void>;
  deletePersona: (id: string) => Promise<void>;
  addBenchmark: (benchmark: Omit<Benchmark, "id" | "createdAt">) => Promise<Benchmark>;
  updateBenchmark: (id: string, updates: Partial<Omit<Benchmark, "id" | "createdAt">>) => Promise<Benchmark | null>;
  deleteBenchmark: (id: string) => Promise<void>;
  setBenchmarks: (benchmarks: Benchmark[]) => Promise<void>;
  addAction: (action: Omit<ElementalAction, "id" | "createdAt">) => Promise<ElementalAction>;
  updateAction: (id: string, updates: Partial<Omit<ElementalAction, "id" | "createdAt">>) => Promise<ElementalAction | null>;
  deleteAction: (id: string) => Promise<void>;
  setActions: (actions: ElementalAction[]) => Promise<void>;
  toggleDailyLog: (actionId: string, date: string) => Promise<DailyLog>;
  addReflection: (reflection: Omit<Reflection, "id" | "createdAt">) => Promise<Reflection>;
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
  const [momentumScore, setMomentumScore] = useState(0);
  const [personaAlignment, setPersonaAlignment] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [subscription, setSubscriptionState] = useState<Subscription>({
    isPremium: false,
    plan: "free",
    expiresAt: null,
    purchasedAt: null,
  });
  const [monthlyReflectionCount, setMonthlyReflectionCount] = useState(0);

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
      ]);

      setSubscriptionState(subscriptionData);
      setMonthlyReflectionCount(reflectionCountData.count);

      setHasOnboardedState(onboarded);
      setPersonaState(personaData);
      setPersonasState(personasData);
      
      if (personaData) {
        const personaBenchmarks = benchmarksData.filter((b) => b.personaId === personaData.id);
        const personaBenchmarkIds = personaBenchmarks.map((b) => b.id);
        const personaActions = actionsData.filter((a) => personaBenchmarkIds.includes(a.benchmarkId));
        const personaActionIds = personaActions.map((a) => a.id);
        const personaLogs = logsData.filter((l) => personaActionIds.includes(l.actionId));
        
        setBenchmarksState(personaBenchmarks);
        setActionsState(personaActions);
        setDailyLogsState(personaLogs);
        
        const [momentum, alignment] = await Promise.all([
          storage.calculateMomentumScoreForPersona(personaData.id),
          storage.getPersonaAlignmentScoreForPersona(personaData.id),
        ]);
        setMomentumScore(momentum);
        setPersonaAlignment(alignment);
      } else {
        setBenchmarksState([]);
        setActionsState([]);
        setDailyLogsState([]);
        setMomentumScore(0);
        setPersonaAlignment(0);
      }
      setReflectionsState(reflectionsData);
    } catch (error) {
      console.error("Error refreshing data:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const setHasOnboarded = async (value: boolean) => {
    await storage.setHasOnboarded(value);
    setHasOnboardedState(value);
  };

  const setPersona = async (personaData: Omit<Persona, "id" | "createdAt">) => {
    const newPersona = await storage.setPersona(personaData);
    setPersonaState(newPersona);
    const allPersonas = await storage.getPersonas();
    setPersonasState(allPersonas);
    return newPersona;
  };

  const addPersona = async (personaData: Omit<Persona, "id" | "createdAt">) => {
    const newPersona = await storage.addPersona(personaData);
    setPersonaState(newPersona);
    const allPersonas = await storage.getPersonas();
    setPersonasState(allPersonas);
    return newPersona;
  };

  const switchPersona = async (id: string) => {
    await storage.setActivePersonaId(id);
    await refreshData();
  };

  const deletePersona = async (id: string) => {
    setBenchmarksState([]);
    setActionsState([]);
    setDailyLogsState([]);
    setMomentumScore(0);
    setPersonaAlignment(0);
    await storage.deletePersona(id);
    await refreshData();
  };

  const addBenchmark = async (benchmark: Omit<Benchmark, "id" | "createdAt">) => {
    const newBenchmark = await storage.addBenchmark(benchmark);
    setBenchmarksState((prev) => [...prev, newBenchmark]);
    return newBenchmark;
  };

  const setBenchmarks = async (benchmarksData: Benchmark[]) => {
    await storage.setBenchmarks(benchmarksData);
    setBenchmarksState(benchmarksData);
  };

  const updateBenchmark = async (id: string, updates: Partial<Omit<Benchmark, "id" | "createdAt">>) => {
    const updated = await storage.updateBenchmark(id, updates);
    if (updated) {
      setBenchmarksState((prev) => prev.map((b) => (b.id === id ? updated : b)));
    }
    return updated;
  };

  const deleteBenchmark = async (id: string) => {
    const actionIdsToDelete = actions.filter((a) => a.benchmarkId === id).map((a) => a.id);
    await storage.deleteBenchmark(id);
    setBenchmarksState((prev) => prev.filter((b) => b.id !== id));
    setActionsState((prev) => prev.filter((a) => a.benchmarkId !== id));
    setDailyLogsState((prev) => prev.filter((l) => !actionIdsToDelete.includes(l.actionId)));
    if (persona) {
      const [momentum, alignment] = await Promise.all([
        storage.calculateMomentumScoreForPersona(persona.id),
        storage.getPersonaAlignmentScoreForPersona(persona.id),
      ]);
      setMomentumScore(momentum);
      setPersonaAlignment(alignment);
    }
  };

  const addAction = async (action: Omit<ElementalAction, "id" | "createdAt">) => {
    const newAction = await storage.addElementalAction(action);
    setActionsState((prev) => [...prev, newAction]);
    return newAction;
  };

  const updateAction = async (id: string, updates: Partial<Omit<ElementalAction, "id" | "createdAt">>) => {
    const updated = await storage.updateElementalAction(id, updates);
    if (updated) {
      setActionsState((prev) => prev.map((a) => (a.id === id ? updated : a)));
    }
    return updated;
  };

  const deleteAction = async (id: string) => {
    await storage.deleteElementalAction(id);
    setActionsState((prev) => prev.filter((a) => a.id !== id));
    setDailyLogsState((prev) => prev.filter((l) => l.actionId !== id));
    if (persona) {
      const [momentum, alignment] = await Promise.all([
        storage.calculateMomentumScoreForPersona(persona.id),
        storage.getPersonaAlignmentScoreForPersona(persona.id),
      ]);
      setMomentumScore(momentum);
      setPersonaAlignment(alignment);
    }
  };

  const setActions = async (actionsData: ElementalAction[]) => {
    await storage.setElementalActions(actionsData);
    setActionsState(actionsData);
  };

  const toggleDailyLog = async (actionId: string, date: string) => {
    const log = await storage.toggleDailyLog(actionId, date);
    
    const activePersona = await storage.getActivePersona();
    if (activePersona) {
      const [allBenchmarks, allActions, allLogs] = await Promise.all([
        storage.getBenchmarks(),
        storage.getElementalActions(),
        storage.getDailyLogs(),
      ]);
      
      const personaBenchmarks = allBenchmarks.filter((b) => b.personaId === activePersona.id);
      const personaBenchmarkIds = personaBenchmarks.map((b) => b.id);
      const personaActions = allActions.filter((a) => personaBenchmarkIds.includes(a.benchmarkId));
      const personaActionIds = personaActions.map((a) => a.id);
      const personaLogs = allLogs.filter((l) => personaActionIds.includes(l.actionId));
      
      setDailyLogsState(personaLogs);
      
      const [momentum, alignment] = await Promise.all([
        storage.calculateMomentumScoreForPersona(activePersona.id),
        storage.getPersonaAlignmentScoreForPersona(activePersona.id),
      ]);
      setMomentumScore(momentum);
      setPersonaAlignment(alignment);
    } else {
      const allLogs = await storage.getDailyLogs();
      setDailyLogsState(allLogs);
    }
    
    return log;
  };

  const addReflection = async (reflection: Omit<Reflection, "id" | "createdAt">) => {
    const newReflection = await storage.addReflection(reflection);
    setReflectionsState((prev) => [...prev, newReflection]);
    return newReflection;
  };

  const clearAllData = async () => {
    await storage.clearAll();
    setHasOnboardedState(false);
    setPersonaState(null);
    setPersonasState([]);
    setBenchmarksState([]);
    setActionsState([]);
    setDailyLogsState([]);
    setReflectionsState([]);
    setMomentumScore(0);
    setPersonaAlignment(0);
    setSubscriptionState({ isPremium: false, plan: "free", expiresAt: null, purchasedAt: null });
    setMonthlyReflectionCount(0);
  };

  const upgradeToPremium = async (plan: "monthly" | "yearly") => {
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
  };

  const incrementReflectionCountFn = async () => {
    const count = await storage.incrementReflectionCount();
    setMonthlyReflectionCount(count);
    return count;
  };

  const canUseReflection = () => {
    if (subscription.isPremium) return true;
    return monthlyReflectionCount < FREE_REFLECTION_LIMIT;
  };

  const canAddPersona = () => {
    if (subscription.isPremium) return true;
    return personas.length < 1;
  };

  const canAddBenchmark = () => {
    return subscription.isPremium;
  };

  return (
    <AppContext.Provider
      value={{
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
        setHasOnboarded,
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
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error("useApp must be used within an AppProvider");
  }
  return context;
}
