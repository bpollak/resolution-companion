import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  ReactNode,
} from "react";
import { AppState, InteractionManager, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  storage,
  generateStorageId,
  Persona,
  Benchmark,
  ElementalAction,
  DailyLog,
  PlanAdjustment,
  PlanAdjustmentChanges,
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
  enableDefaultPersonalizedReminders,
  getReminderPrimerState,
  recordReminderPrimerAnswer,
  registerReminderActions,
  recordOrganicAppOpen,
  recordReminderHookTap,
  selectMarkAllDoneActions,
  MARK_ALL_DONE_ACTION,
} from "@/lib/notifications";
import * as Notifications from "expo-notifications";
import { logger } from "@/lib/logger";
import { navigationRef } from "@/navigation/navigationRef";
import { withSuggestedReminderTime } from "@/lib/habit-reminders";
import { track, flushTelemetry } from "@/lib/telemetry";
import { getApiUrl, getAuthHeaders } from "@/lib/query-client";
import { syncWidgetData, consumePendingVotes } from "@/lib/widget";
import { createTrailingDebounce } from "@/lib/debounce";
import { unlockRewardsForMilestoneCount, Reward } from "@/lib/rewards";
import { isHealthAvailable, initHealth, isHealthGoalMet } from "@/lib/health";
import {
  resolveSubscriptionCheck,
  sameSubscription,
  type ServerSubscriptionStatus,
  type SubscriptionVerificationStatus,
} from "@/lib/subscription";
import {
  completeLogIn,
  logDateKey,
  upsertLogIn,
  type DailyLogCompletion,
} from "@/lib/daily-log";
import { iapService } from "@/lib/iap";
import { canDeleteMilestone } from "@/lib/plan-editing";
import {
  createPrivateBackup,
  getPrivateBackupEnabled,
  setPrivateBackupEnabled,
} from "@/lib/icloud-backup";

interface AppContextType {
  hasOnboarded: boolean;
  persona: Persona | null;
  personas: Persona[];
  benchmarks: Benchmark[];
  actions: ElementalAction[];
  dailyLogs: DailyLog[];
  planAdjustments: PlanAdjustment[];
  reflections: Reflection[];
  momentumScore: number;
  personaAlignment: number;
  progressSnapshot: ProgressSnapshot;
  isLoading: boolean;
  subscription: Subscription;
  subscriptionVerificationStatus: SubscriptionVerificationStatus;
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
  toggleDailyLog: (
    actionId: string,
    date: string,
    completion?: Pick<DailyLog, "completionSource" | "completionKind">,
  ) => Promise<DailyLog>;
  /**
   * Idempotent completion for automatic votes (Health, widget, Siri,
   * notification). Never un-completes; resolves to null when the day was
   * already complete, otherwise to the new log once it is persisted.
   */
  completeDailyLog: (
    actionId: string,
    date: string,
    completion: DailyLogCompletion,
  ) => Promise<DailyLog | null>;
  setDailyLogNote: (
    actionId: string,
    date: string,
    note: string,
  ) => Promise<void>;
  applyPlanAdjustment: (
    actionId: string,
    changes: PlanAdjustmentChanges,
    rationale: string,
  ) => Promise<PlanAdjustment | null>;
  dismissPlanAdjustment: (
    actionId: string,
    changes: PlanAdjustmentChanges,
    rationale: string,
  ) => Promise<PlanAdjustment | null>;
  addReflection: (
    reflection: Omit<Reflection, "id" | "createdAt">,
  ) => Promise<Reflection>;
  refreshData: () => Promise<void>;
  /**
   * Concurrent calls share one check. `force` waits for any in-flight check
   * and then runs a fresh one, for callers that just changed the store's
   * state (a completed purchase or restore) and need a check that saw it.
   */
  verifySubscription: (options?: {
    force?: boolean;
  }) => Promise<SubscriptionVerificationStatus>;
  clearAllData: () => Promise<void>;
  incrementReflectionCount: () => Promise<number>;
  canUseReflection: () => boolean;
  canAddPersona: () => boolean;
  canAddBenchmark: () => boolean;
  /** A new plan is waiting for the reminder primer on Today. */
  reminderPrimerPending: boolean;
  answerReminderPrimer: (accept: boolean) => Promise<void>;
  /**
   * Once per install, gives the active plan's untimed habits their
   * anchor-suggested reminder time. Call when the person turns reminders on;
   * resolves to the (possibly updated) actions to schedule with.
   */
  applySuggestedReminderTimes: () => Promise<ElementalAction[]>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const FREE_REFLECTION_LIMIT = 10;

// Milestone ids whose completion celebration has already been shown — each
// milestone is celebrated exactly once, ever (survives restarts)
const MILESTONE_CELEBRATION_SEEN_KEY = "milestone_celebration_seen_ids";
const HABIT_TIMES_BACKFILLED_KEY = "evolve_habit_times_backfilled";

// try/catch lives in these module helpers, outside AppProvider: the React
// Compiler skips the whole provider over conditional expressions in a try.
function parseSeenIds(raw: string | null): string[] {
  try {
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Whether `key` already holds `marker`; false when storage fails. */
async function markerMatches(key: string, marker: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(key)) === marker;
  } catch {
    return false;
  }
}

/**
 * Records `marker` under `key` unless it is already there. False only when
 * it was already recorded; storage failures claim it (the guard fails open).
 */
async function claimMarker(key: string, marker: string): Promise<boolean> {
  try {
    if ((await AsyncStorage.getItem(key)) === marker) return false;
    await AsyncStorage.setItem(key, marker);
  } catch {
    // Fail open
  }
  return true;
}

// A promise resolved once stored data has loaded. Built by useState's lazy
// initializer rather than in a ref during render, which the React Compiler
// rejects.
function createStoreReadySignal(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [hasOnboarded, setHasOnboardedState] = useState(false);
  const [persona, setPersonaState] = useState<Persona | null>(null);
  const [personas, setPersonasState] = useState<Persona[]>([]);
  const [benchmarks, setBenchmarksState] = useState<Benchmark[]>([]);
  const [actions, setActionsState] = useState<ElementalAction[]>([]);
  const [dailyLogs, setDailyLogsState] = useState<DailyLog[]>([]);
  const [planAdjustments, setPlanAdjustmentsState] = useState<PlanAdjustment[]>(
    [],
  );
  const [reflections, setReflectionsState] = useState<Reflection[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [subscription, setSubscriptionState] = useState<Subscription>({
    isPremium: false,
    plan: "free",
    expiresAt: null,
    purchasedAt: null,
  });
  const [subscriptionVerificationStatus, setSubscriptionVerificationStatus] =
    useState<SubscriptionVerificationStatus>("checking");
  const subscriptionVerificationPromiseRef =
    useRef<Promise<SubscriptionVerificationStatus> | null>(null);
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
        planAdjustmentsData,
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
        storage.getPlanAdjustments(),
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
        setPlanAdjustmentsState(
          planAdjustmentsData.filter(
            (entry) => entry.personaId === personaData.id,
          ),
        );
        setReflectionsState(
          reflectionsData.filter(
            (entry) => !entry.personaId || entry.personaId === personaData.id,
          ),
        );
      } else {
        setBenchmarksState([]);
        setActionsState([]);
        setDailyLogsState([]);
        setPlanAdjustmentsState([]);
        setReflectionsState([]);
      }
    } catch (error) {
      logger.error("Error refreshing data:", error);
    }
    // After the try rather than in `finally`: the React Compiler skips the
    // whole provider over try/finally, and the catch above never throws.
    setIsLoading(false);
  }, []);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const startSubscriptionVerification = useCallback(() => {
    setSubscriptionVerificationStatus("checking");
    const verification = (async (): Promise<SubscriptionVerificationStatus> => {
      const local = await storage.getSubscription();
      let server: ServerSubscriptionStatus | null = null;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      try {
        const deviceId = await storage.getDeviceId();
        const res = await fetch(
          new URL(
            `/api/subscription/status/${deviceId}`,
            getApiUrl(),
          ).toString(),
          { headers: getAuthHeaders(), signal: controller.signal },
        );
        if (res.ok) server = (await res.json()) as ServerSubscriptionStatus;
      } catch {
        // StoreKit below can still recover a current entitlement. Its receipt
        // will be server-validated before Premium is granted.
      }
      clearTimeout(timeout);

      const store =
        Platform.OS !== "web"
          ? await iapService.checkCurrentEntitlements()
          : null;
      const { subscription: next, status } = resolveSubscriptionCheck({
        local,
        server,
        store,
        planForProduct: (productId) =>
          iapService.getPlanFromProductId(productId),
      });
      if (next !== local) await storage.setSubscription(next);
      // Storage hands back a fresh object on every check; keep the current
      // one when nothing changed so context consumers don't re-render.
      setSubscriptionState((current) =>
        sameSubscription(current, next) ? current : next,
      );
      setSubscriptionVerificationStatus(status);
      return status;
    })().finally(() => {
      if (subscriptionVerificationPromiseRef.current === verification) {
        subscriptionVerificationPromiseRef.current = null;
      }
    });

    subscriptionVerificationPromiseRef.current = verification;
    return verification;
  }, []);

  const verifySubscription = useCallback(
    (options?: { force?: boolean }) => {
      const inFlight = subscriptionVerificationPromiseRef.current;
      if (!inFlight) return startSubscriptionVerification();
      if (!options?.force) return inFlight;
      // The in-flight check may have read StoreKit before a purchase landed
      // and would report (and save) the pre-purchase state. Wait it out, then
      // share whichever check started after it, which saw the purchase.
      return inFlight
        .catch(() => undefined)
        .then(
          () =>
            subscriptionVerificationPromiseRef.current ??
            startSubscriptionVerification(),
        );
    },
    [startSubscriptionVerification],
  );

  // Private iCloud backup is opt-in. Once enabled, coalesce local changes
  // into one quiet snapshot; manual Backup Now remains available in Profile.
  useEffect(() => {
    if (Platform.OS !== "ios" || isLoading || !hasOnboarded) return;
    // Serializing the snapshot is synchronous JS work; waiting for
    // interactions keeps it from landing mid-gesture or mid-animation.
    let task: { cancel: () => void } | undefined;
    const timeout = setTimeout(() => {
      task = InteractionManager.runAfterInteractions(() => {
        getPrivateBackupEnabled()
          .then((enabled) => (enabled ? createPrivateBackup() : null))
          .catch((error) =>
            logger.warn("Private iCloud backup skipped:", error),
          );
      });
    }, 2500);
    return () => {
      clearTimeout(timeout);
      task?.cancel();
    };
  }, [
    isLoading,
    hasOnboarded,
    personas,
    benchmarks,
    actions,
    dailyLogs,
    planAdjustments,
    reflections,
    aiConsent,
  ]);

  // Cold-start telemetry is fire-and-forget and never delays first render.
  useEffect(() => {
    if (Platform.OS === "web") return;
    track("app_open");
    flushTelemetry().catch(() => {});

    // Subscription verification runs separately after AsyncStorage hydration
    // so an older refresh result cannot overwrite a newly verified purchase.
  }, []);

  useEffect(() => {
    if (Platform.OS === "web" || isLoading) return;

    verifySubscription().catch(() => {});
  }, [isLoading, verifySubscription]);

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
    const [currentActions, currentBenchmarks] = await Promise.all([
      storage.getElementalActions(),
      storage.getBenchmarks(),
    ]);
    if (!canDeleteMilestone(id, currentBenchmarks, currentActions)) {
      throw new Error("Keep at least one action in this persona.");
    }
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
      const newAction = await storage.addElementalAction(
        action,
        persona?.createdAt,
      );
      setActionsState((prev) => [...prev, newAction]);
      return newAction;
    },
    [persona?.createdAt],
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

  // Existing habits predate reminder times. Filling them silently on upgrade
  // would add notifications nobody asked for, so this waits for an explicit
  // "turn on" and runs once: a time cleared later stays cleared.
  const applySuggestedReminderTimes = useCallback(async () => {
    const current = reminderStateRef.current.actions;
    try {
      if ((await AsyncStorage.getItem(HABIT_TIMES_BACKFILLED_KEY)) === "true") {
        return current;
      }
      const next = current.map(withSuggestedReminderTime);
      for (const action of next) {
        const before = current.find((item) => item.id === action.id);
        if (
          action.reminderTime &&
          action.reminderTime !== before?.reminderTime
        ) {
          await storage.updateElementalAction(action.id, {
            reminderTime: action.reminderTime,
          });
        }
      }
      setActionsState(next);
      await AsyncStorage.setItem(HABIT_TIMES_BACKFILLED_KEY, "true");
      return next;
    } catch (error) {
      logger.error("Failed to apply suggested reminder times:", error);
      return current;
    }
  }, []);

  // Optimistic: the ring/streak/chips must respond on the same frame as the
  // tap. State is computed and applied synchronously; the AsyncStorage write
  // happens behind it on a FIFO queue (upsertDailyLog). Both toggle surfaces
  // (Today, Calendar) only operate on the active persona's actions, so the
  // persona-scoped state invariant holds.
  const dailyLogsRef = useRef(dailyLogs);
  // Synced at commit, not during render (the React Compiler skips a
  // component that writes refs in render). Toggles also write it directly
  // so rapid taps chain on the newest logs before the commit.
  useLayoutEffect(() => {
    dailyLogsRef.current = dailyLogs;
  }, [dailyLogs]);
  const toggleDailyLog = useCallback(
    async (
      actionId: string,
      date: string,
      completion: Pick<DailyLog, "completionSource" | "completionKind"> = {
        completionSource: "manual",
        completionKind: "full",
      },
    ) => {
      const dateStr = date.includes("T") ? date.split("T")[0] : date;
      const existing = dailyLogsRef.current.find((l) => {
        const logDateStr = l.logDate.includes("T")
          ? l.logDate.split("T")[0]
          : l.logDate;
        return l.actionId === actionId && logDateStr === dateStr;
      });
      const nextStatus = !existing?.status;
      const log: DailyLog = existing
        ? {
            ...existing,
            status: nextStatus,
            ...(nextStatus ? completion : {}),
          }
        : {
            id: generateStorageId(),
            actionId,
            logDate: dateStr,
            status: true,
            createdAt: new Date().toISOString(),
            ...completion,
          };
      if (log.status) {
        if (!dailyLogsRef.current.some((l) => l.status)) {
          track("first_action_logged");
        }
        track("action_logged");
      }
      // Same (action, day) dedupe as storage.upsertDailyLog so a legacy
      // duplicate can't keep the UI showing a state storage no longer has.
      setDailyLogsState((prev) => upsertLogIn(prev, log));
      storage.upsertDailyLog(log).catch(() => {
        // Persist failed — reload persisted truth so the UI doesn't drift
        refreshData();
      });
      return log;
    },
    [refreshData],
  );

  const completeDailyLog = useCallback(
    async (
      actionId: string,
      date: string,
      completion: DailyLogCompletion,
    ): Promise<DailyLog | null> => {
      const dateStr = logDateKey(date);
      const result = completeLogIn(
        dailyLogsRef.current,
        actionId,
        dateStr,
        completion,
        () => ({
          id: generateStorageId(),
          createdAt: new Date().toISOString(),
        }),
      );
      if (!result.changed) return null;
      if (!dailyLogsRef.current.some((l) => l.status)) {
        track("first_action_logged");
      }
      track("action_logged");
      // Votes arrive in loops (widget queue, Health, Mark all done) faster
      // than React re-renders; advancing the ref now lets the next call in
      // the same pass see this completion instead of writing a duplicate.
      dailyLogsRef.current = result.logs;
      const created = { id: result.log.id, createdAt: result.log.createdAt };
      setDailyLogsState(
        (prev) =>
          completeLogIn(prev, actionId, dateStr, completion, () => created)
            .logs,
      );
      await storage
        .completeDailyLog(actionId, dateStr, {
          ...completion,
          id: result.log.id,
        })
        .catch((error) => {
          // Persist failed: reload persisted truth so the UI doesn't drift
          refreshData();
          throw error;
        });
      return result.log;
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
      setDailyLogsState((prev) => upsertLogIn(prev, updated));
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

  const applyPlanAdjustment = useCallback(
    async (
      actionId: string,
      changes: PlanAdjustmentChanges,
      rationale: string,
    ) => {
      if (!persona) return null;
      const result = await storage.applyPlanAdjustment(
        actionId,
        persona.id,
        changes,
        rationale,
      );
      if (!result) return null;
      setActionsState((previous) =>
        previous.map((action) =>
          action.id === result.action.id ? result.action : action,
        ),
      );
      setPlanAdjustmentsState((previous) => [...previous, result.adjustment]);
      track("plan_tuneup_applied");
      return result.adjustment;
    },
    [persona],
  );

  const dismissPlanAdjustment = useCallback(
    async (
      actionId: string,
      changes: PlanAdjustmentChanges,
      rationale: string,
    ) => {
      if (!persona) return null;
      const action = actions.find((candidate) => candidate.id === actionId);
      if (!action) return null;
      const before: PlanAdjustmentChanges = {};
      for (const key of [
        "frequency",
        "anchorLink",
        "kickstartVersion",
      ] as const) {
        if (changes[key] !== undefined) before[key] = action[key] as never;
      }
      const adjustment = await storage.recordPlanAdjustment({
        personaId: persona.id,
        actionId,
        before,
        after: changes,
        rationale: rationale.trim().slice(0, 500),
        status: "dismissed",
      });
      setPlanAdjustmentsState((previous) => [...previous, adjustment]);
      track("plan_tuneup_dismissed");
      return adjustment;
    },
    [actions, persona],
  );

  const clearAllData = useCallback(async () => {
    await setPrivateBackupEnabled(false);
    await storage.clearAll();
    setHasOnboardedState(false);
    setPersonaState(null);
    setPersonasState([]);
    setBenchmarksState([]);
    setActionsState([]);
    setDailyLogsState([]);
    setPlanAdjustmentsState([]);
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
        const seen = parseSeenIds(raw);
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

  // Reminder-plan self-heal: every foreground refreshes the rolling local
  // schedule when its date or completion context changed. The signature check
  // keeps this idempotent when the existing 14-day plan is still current.
  const reminderMilestoneTitles = useMemo(
    () => Object.fromEntries(benchmarks.map((item) => [item.id, item.title])),
    [benchmarks],
  );
  const defaultReminderInitializationStartedRef = useRef(false);
  const [reminderPrimerPending, setReminderPrimerPending] = useState(false);
  const answerReminderPrimer = useCallback(
    async (accept: boolean) => {
      setReminderPrimerPending(false);
      await recordReminderPrimerAnswer(accept).catch(() => {});
      if (!accept || !persona) return;
      const planActions = await applySuggestedReminderTimes();
      await enableDefaultPersonalizedReminders({
        streakCount: computeStreak(planActions, dailyLogs).current,
        missedRun: computeLapse(planActions, dailyLogs).missedDays,
        personaName: persona.name,
        monthlyConsistency: personaAlignment,
        actions: planActions,
        dailyLogs,
        milestoneTitles: reminderMilestoneTitles,
      }).catch((error) =>
        logger.error("Failed to enable reminders from primer:", error),
      );
    },
    [
      applySuggestedReminderTimes,
      dailyLogs,
      persona,
      personaAlignment,
      reminderMilestoneTitles,
    ],
  );
  useEffect(() => {
    if (
      Platform.OS === "web" ||
      isLoading ||
      !hasOnboarded ||
      !persona ||
      actions.length === 0 ||
      defaultReminderInitializationStartedRef.current
    ) {
      return;
    }
    defaultReminderInitializationStartedRef.current = true;
    // New plans ask through the Today primer first; iOS only prompts after
    // the person taps Turn on. Earlier users keep their existing setting.
    getReminderPrimerState()
      .then((state) => {
        if (state === "pending") {
          setReminderPrimerPending(true);
          return;
        }
        if (state === "declined") return;
        return enableDefaultPersonalizedReminders({
          streakCount: computeStreak(actions, dailyLogs).current,
          missedRun: computeLapse(actions, dailyLogs).missedDays,
          personaName: persona.name,
          monthlyConsistency: personaAlignment,
          actions,
          dailyLogs,
          milestoneTitles: reminderMilestoneTitles,
        });
      })
      .catch((error) =>
        logger.error("Failed to initialize personalized reminders:", error),
      );
  }, [
    actions,
    dailyLogs,
    hasOnboarded,
    isLoading,
    persona,
    personaAlignment,
    reminderMilestoneTitles,
  ]);

  const reminderStateRef = useRef({
    hasOnboarded,
    actions,
    dailyLogs,
    persona,
    personaAlignment,
    milestoneTitles: reminderMilestoneTitles,
    isLoading,
  });
  useEffect(() => {
    reminderStateRef.current = {
      hasOnboarded,
      actions,
      dailyLogs,
      persona,
      personaAlignment,
      milestoneTitles: reminderMilestoneTitles,
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
        actions: currentActions,
        dailyLogs: currentLogs,
        milestoneTitles: reminderStateRef.current.milestoneTitles,
      });
    });
    return () => subscription.remove();
  }, []);

  // Resolves once stored data has loaded and reminderStateRef reflects it
  // (this effect is declared after the ref sync above, so it runs after it in
  // the same commit). isLoading never returns to true.
  const [storeReady] = useState(createStoreReadySignal);
  useEffect(() => {
    if (!isLoading) storeReady.resolve();
  }, [isLoading, storeReady]);

  // "Mark all done ✓" quick action on the daily reminder. The response can
  // arrive live (listener) or on the next launch (last-response) when iOS ran
  // the action without waking JS, and on a background cold launch both paths
  // deliver the same response at once. The in-flight map joins concurrent
  // deliveries; the persisted handled-key skips later replays. Logs are
  // written for the notification's FIRE date, so a tap on last night's
  // reminder processed this morning still credits yesterday.
  const reminderResponsesInFlightRef = useRef(new Map<string, Promise<void>>());
  useEffect(() => {
    if (Platform.OS === "web") return;
    registerReminderActions();

    // The reminder is about today's plan — land its tap on Today rather than
    // whatever tab was last open. On a cold launch this response arrives
    // before the NavigationContainer is ready, so poll briefly.
    const navigateToTodayTab = () => {
      let attempts = 0;
      const attempt = () => {
        if (!navigationRef.isReady()) return false;
        navigationRef.navigate("Main", { screen: "TodayTab" });
        return true;
      };
      if (attempt()) return;
      const timer = setInterval(() => {
        attempts += 1;
        if (attempt() || attempts >= 20) clearInterval(timer);
      }, 250);
    };

    const processResponse = async (
      response: Notifications.NotificationResponse,
    ) => {
      const data = response.notification.request.content.data as
        | {
            type?: string;
            hook?: string;
            dateKey?: string;
            actionIds?: string[];
          }
        | undefined;
      const isHabitReminder = data?.type === "habit-reminder";
      if (data?.type !== "daily-reminder" && !isHabitReminder) return;
      // A plain tap opened the app from the reminder: credit the voice that
      // earned it so the hook portfolio learns what this user responds to.
      // getLastNotificationResponseAsync replays the same response on every
      // launch, so the credit is deduped with a persisted marker (same
      // pattern as the mark-all-done guard below).
      if (
        response.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER
      ) {
        const tapMarker = `${response.notification.request.identifier}|${response.notification.date}`;
        // Guard fails open: an over-count nudges the portfolio, nothing more.
        if (!(await claimMarker("evolve_reminder_tap_handled", tapMarker))) {
          return;
        }
        if (isHabitReminder) {
          track("habit_reminder_tap");
        } else {
          track("notification_tap");
          // Hooks voice only the digest; a timed habit's copy is fixed.
          recordReminderHookTap(data.hook).catch(() => {});
        }
        navigateToTodayTab();
        return;
      }
      if (response.actionIdentifier !== MARK_ALL_DONE_ACTION) return;

      const firedAt = new Date(response.notification.date);
      const dateKey = data.dateKey ?? getLocalDateString(firedAt);
      const handledKey = `evolve_reminder_action_handled`;
      const marker = `${response.notification.request.identifier}|${dateKey}`;
      // Guard fails open: completion below is idempotent.
      if (await markerMatches(handledKey, marker)) return;

      // The action runs without opening the app, so this can be a cold
      // background launch where the store hasn't loaded yet. Completing
      // against the empty pre-load action list would mark nothing.
      await storeReady.promise;
      const currentActions = reminderStateRef.current.actions;
      if (currentActions.length === 0) return;

      track(
        isHabitReminder ? "habit_reminder_done" : "notification_mark_all_done",
      );
      for (const action of selectMarkAllDoneActions(
        currentActions,
        dateKey,
        data.actionIds,
      )) {
        await completeDailyLog(action.id, dateKey, {
          completionSource: "notification",
          completionKind: "full",
        });
      }
      // Recorded only after every write landed: a failed pass throws above,
      // leaving the response uncleared for a retry on the next launch.
      await AsyncStorage.setItem(handledKey, marker).catch(() => {});
    };

    const handleResponse = (
      response: Notifications.NotificationResponse,
    ): Promise<void> => {
      const key = `${response.notification.request.identifier}|${response.notification.date}|${response.actionIdentifier}`;
      const inFlight = reminderResponsesInFlightRef.current;
      const existing = inFlight.get(key);
      if (existing) return existing;
      const run = processResponse(response).finally(() => {
        inFlight.delete(key);
      });
      inFlight.set(key, run);
      return run;
    };

    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        handleResponse(response).catch((error) =>
          logger.error("Failed to handle reminder action:", error),
        );
      },
    );
    Notifications.getLastNotificationResponseAsync()
      .then(async (response) => {
        if (response) {
          await handleResponse(response);
          await Notifications.clearLastNotificationResponseAsync();
        } else {
          await recordOrganicAppOpen();
        }
      })
      .catch((error) =>
        logger.error("Failed to handle last reminder response:", error),
      );
    return () => subscription.remove();
    // storeReady is stable (useState); listed for the lint rule only
  }, [completeDailyLog, storeReady]);

  // Fold in votes cast from the widget or Siri while the app was closed or
  // backgrounded. Votes only ever complete (never un-complete): a queued vote
  // for an action the user has since completed in-app is dropped, not
  // toggled. Votes for actions outside the active persona are dropped too.
  const applyPendingWidgetVotes = useCallback(
    (currentActions: ElementalAction[]) => {
      for (const vote of consumePendingVotes()) {
        if (!currentActions.some((a) => a.id === vote.actionId)) continue;
        completeDailyLog(vote.actionId, vote.date, {
          completionSource: vote.source ?? "widget",
          completionKind: vote.kind,
        })
          .then((log) => {
            if (log) track("widget_action_logged");
          })
          .catch((error) =>
            logger.error("Failed to apply widget vote:", error),
          );
      }
    },
    [completeDailyLog],
  );

  // Keep the home/lock-screen widget's snapshot in step with the store.
  // Writing the App Group and reloading timelines is synchronous native work;
  // a burst of check-offs collapses into one sync after the taps settle.
  const [widgetSync] = useState(() =>
    createTrailingDebounce<Parameters<typeof syncWidgetData>>(
      (args) => syncWidgetData(...args),
      500,
    ),
  );

  // Leaving the app must not strand a pending sync, or the widget would
  // show yesterday's state until the next launch.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") widgetSync.flush();
    });
    return () => {
      sub.remove();
      widgetSync.flush();
    };
  }, [widgetSync]);

  useEffect(() => {
    if (Platform.OS !== "ios" || isLoading) return;
    applyPendingWidgetVotes(actions);
    widgetSync.schedule([
      actions,
      dailyLogs,
      persona,
      {
        streak: progressSnapshot.streak.current,
        shieldUsed: progressSnapshot.streak.shieldUsed,
      },
    ]);
    // Background launches (notification actions) never change AppState, so
    // sync now rather than risk suspension before the timer fires.
    if (AppState.currentState !== "active") widgetSync.flush();
  }, [
    widgetSync,
    isLoading,
    actions,
    dailyLogs,
    persona,
    applyPendingWidgetVotes,
    progressSnapshot.streak,
  ]);

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
      applyPendingWidgetVotes(reminderStateRef.current.actions);
    });
    return () => subscription.remove();
  }, [applyPendingWidgetVotes]);

  // Apple Health auto-votes: actions opted into Health auto-completion get
  // their vote cast when a matching sample exists for today. Runs once per
  // foreground; a cast vote flows through the idempotent completion, so
  // rings, streaks, and the widget update the same way a tap would. Runs are
  // single-flight: a second foreground while HealthKit is still answering
  // joins the running pass instead of starting an overlapping one.
  const healthCheckDoneRef = useRef(false);
  const healthRunRef = useRef<Promise<void> | null>(null);
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
          (l) => l.actionId === action.id && logDateKey(l.logDate) === todayStr,
        );
        return !existing?.status;
      });
      if (candidates.length === 0) return;
      if (!(await initHealth())) return;
      for (const action of candidates) {
        if (await isHealthGoalMet(action.healthAutoComplete!, today)) {
          const log = await completeDailyLog(action.id, todayStr, {
            completionSource: "health",
            completionKind: "full",
          });
          if (log) track("health_auto_vote");
        }
      }
    };

    const runOnce = () => {
      if (!healthRunRef.current) {
        healthRunRef.current = runHealthAutoVotes()
          .catch((error) => logger.error("Health auto-vote failed:", error))
          .finally(() => {
            healthRunRef.current = null;
          });
      }
      return healthRunRef.current;
    };

    if (!healthCheckDoneRef.current) {
      healthCheckDoneRef.current = true;
      runOnce();
    }
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      runOnce();
    });
    return () => subscription.remove();
  }, [isLoading, completeDailyLog]);

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
      planAdjustments,
      reflections,
      momentumScore,
      personaAlignment,
      progressSnapshot,
      isLoading,
      subscription,
      subscriptionVerificationStatus,
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
      completeDailyLog,
      setDailyLogNote,
      applyPlanAdjustment,
      dismissPlanAdjustment,
      addReflection,
      refreshData,
      verifySubscription,
      clearAllData,
      incrementReflectionCount: incrementReflectionCountFn,
      canUseReflection,
      canAddPersona,
      canAddBenchmark,
      reminderPrimerPending,
      answerReminderPrimer,
      applySuggestedReminderTimes,
    }),
    [
      hasOnboarded,
      persona,
      personas,
      benchmarks,
      actions,
      dailyLogs,
      planAdjustments,
      reflections,
      momentumScore,
      personaAlignment,
      progressSnapshot,
      isLoading,
      subscription,
      subscriptionVerificationStatus,
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
      completeDailyLog,
      setDailyLogNote,
      applyPlanAdjustment,
      dismissPlanAdjustment,
      addReflection,
      refreshData,
      verifySubscription,
      clearAllData,
      incrementReflectionCountFn,
      canUseReflection,
      canAddPersona,
      canAddBenchmark,
      reminderPrimerPending,
      answerReminderPrimer,
      applySuggestedReminderTimes,
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
