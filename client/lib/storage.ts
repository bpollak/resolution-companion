import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEYS = {
  HAS_ONBOARDED: "hasOnboarded",
  PERSONA: "persona",
  PERSONAS: "personas",
  ACTIVE_PERSONA_ID: "activePersonaId",
  BENCHMARKS: "benchmarks",
  ELEMENTAL_ACTIONS: "elementalActions",
  DAILY_LOGS: "dailyLogs",
  REFLECTIONS: "reflections",
  ONBOARDING_MESSAGES: "onboardingMessages",
  SUBSCRIPTION: "subscription",
  MONTHLY_REFLECTION_COUNT: "monthlyReflectionCount",
  DEVICE_ID: "deviceId",
  STRIPE_CUSTOMER_ID: "stripeCustomerId",
};

export interface Persona {
  id: string;
  name: string;
  description: string;
  createdAt: string;
}

export interface Benchmark {
  id: string;
  personaId: string;
  title: string;
  targetDate: string | null;
  status: "active" | "completed";
  createdAt: string;
}

export interface ElementalAction {
  id: string;
  benchmarkId: string;
  title: string;
  frequency: string[];
  anchorLink: string;
  kickstartVersion: string;
  createdAt: string;
}

export interface DailyLog {
  id: string;
  actionId: string;
  logDate: string;
  status: boolean;
  createdAt: string;
}

export interface Reflection {
  id: string;
  periodType: "weekly" | "monthly" | "yearly";
  userInput: string;
  aiFeedback: string;
  momentumScore: number;
  createdAt: string;
  conversation?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface Subscription {
  isPremium: boolean;
  plan: "free" | "monthly" | "yearly";
  expiresAt: string | null;
  purchasedAt: string | null;
}

export interface MonthlyReflectionCount {
  month: string;
  count: number;
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

export const storage = {
  async getHasOnboarded(): Promise<boolean> {
    const value = await AsyncStorage.getItem(STORAGE_KEYS.HAS_ONBOARDED);
    return value === "true";
  },

  async setHasOnboarded(value: boolean): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEYS.HAS_ONBOARDED, value.toString());
  },

  async getPersona(): Promise<Persona | null> {
    const value = await AsyncStorage.getItem(STORAGE_KEYS.PERSONA);
    return value ? JSON.parse(value) : null;
  },

  async setPersona(persona: Omit<Persona, "id" | "createdAt">): Promise<Persona> {
    const newPersona: Persona = {
      ...persona,
      id: generateId(),
      createdAt: new Date().toISOString(),
    };
    await AsyncStorage.setItem(STORAGE_KEYS.PERSONA, JSON.stringify(newPersona));
    const personas = await this.getPersonas();
    personas.push(newPersona);
    await this.setPersonas(personas);
    await this.setActivePersonaId(newPersona.id);
    return newPersona;
  },

  async getPersonas(): Promise<Persona[]> {
    const value = await AsyncStorage.getItem(STORAGE_KEYS.PERSONAS);
    if (value) {
      const personas: Persona[] = JSON.parse(value);
      const seenById = new Map<string, Persona>();
      const seenByName = new Map<string, Persona>();
      for (const p of personas) {
        if (!seenById.has(p.id) && !seenByName.has(p.name)) {
          seenById.set(p.id, p);
          seenByName.set(p.name, p);
        }
      }
      const deduped = Array.from(seenById.values());
      if (deduped.length !== personas.length) {
        await this.setPersonas(deduped);
      }
      return deduped;
    }
    const legacy = await this.getPersona();
    return legacy ? [legacy] : [];
  },

  async setPersonas(personas: Persona[]): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEYS.PERSONAS, JSON.stringify(personas));
  },

  async addPersona(persona: Omit<Persona, "id" | "createdAt">): Promise<Persona> {
    const newPersona: Persona = {
      ...persona,
      id: generateId(),
      createdAt: new Date().toISOString(),
    };
    const personas = await this.getPersonas();
    personas.push(newPersona);
    await this.setPersonas(personas);
    await AsyncStorage.setItem(STORAGE_KEYS.PERSONA, JSON.stringify(newPersona));
    await this.setActivePersonaId(newPersona.id);
    return newPersona;
  },

  async deletePersona(id: string): Promise<void> {
    const personas = await this.getPersonas();
    const filtered = personas.filter((p) => p.id !== id);
    await this.setPersonas(filtered);
    const benchmarks = await this.getBenchmarks();
    const benchmarkIds = benchmarks.filter((b) => b.personaId === id).map((b) => b.id);
    const filteredBenchmarks = benchmarks.filter((b) => b.personaId !== id);
    await this.setBenchmarks(filteredBenchmarks);
    const actions = await this.getElementalActions();
    const actionIds = actions.filter((a) => benchmarkIds.includes(a.benchmarkId)).map((a) => a.id);
    const filteredActions = actions.filter((a) => !benchmarkIds.includes(a.benchmarkId));
    await this.setElementalActions(filteredActions);
    const logs = await this.getDailyLogs();
    const filteredLogs = logs.filter((l) => !actionIds.includes(l.actionId));
    await this.setDailyLogs(filteredLogs);
    const activeId = await this.getActivePersonaId();
    if (activeId === id && filtered.length > 0) {
      await this.setActivePersonaId(filtered[0].id);
      await AsyncStorage.setItem(STORAGE_KEYS.PERSONA, JSON.stringify(filtered[0]));
    } else if (filtered.length === 0) {
      await AsyncStorage.removeItem(STORAGE_KEYS.PERSONA);
      await AsyncStorage.removeItem(STORAGE_KEYS.ACTIVE_PERSONA_ID);
      await this.setHasOnboarded(false);
    }
  },

  async calculateMomentumScoreForPersona(personaId: string, days: number = 7): Promise<number> {
    const benchmarks = await this.getBenchmarks();
    const personaBenchmarkIds = benchmarks.filter((b) => b.personaId === personaId).map((b) => b.id);
    const allActions = await this.getElementalActions();
    const personaActions = allActions.filter((a) => personaBenchmarkIds.includes(a.benchmarkId));
    const logs = await this.getDailyLogs();

    if (personaActions.length === 0) return 0;

    const today = new Date();
    let totalExpected = 0;
    let totalCompleted = 0;

    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];
      const dayOfWeek = date.toLocaleDateString("en-US", { weekday: "long" });

      for (const action of personaActions) {
        if (action.frequency.includes(dayOfWeek)) {
          totalExpected++;
          const log = logs.find(
            (l) => l.actionId === action.id && l.logDate.split("T")[0] === dateStr
          );
          if (log?.status) {
            totalCompleted++;
          }
        }
      }
    }

    return totalExpected > 0 ? Math.round((totalCompleted / totalExpected) * 100) : 0;
  },

  async getPersonaAlignmentScoreForPersona(personaId: string): Promise<number> {
    return this.calculateMomentumScoreForPersona(personaId, 30);
  },

  async getActivePersonaId(): Promise<string | null> {
    return AsyncStorage.getItem(STORAGE_KEYS.ACTIVE_PERSONA_ID);
  },

  async setActivePersonaId(id: string): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEYS.ACTIVE_PERSONA_ID, id);
    const personas = await this.getPersonas();
    const persona = personas.find((p) => p.id === id);
    if (persona) {
      await AsyncStorage.setItem(STORAGE_KEYS.PERSONA, JSON.stringify(persona));
    }
  },

  async getActivePersona(): Promise<Persona | null> {
    const activeId = await this.getActivePersonaId();
    if (!activeId) return this.getPersona();
    const personas = await this.getPersonas();
    return personas.find((p) => p.id === activeId) || null;
  },

  async getBenchmarks(): Promise<Benchmark[]> {
    const value = await AsyncStorage.getItem(STORAGE_KEYS.BENCHMARKS);
    return value ? JSON.parse(value) : [];
  },

  async setBenchmarks(benchmarks: Benchmark[]): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEYS.BENCHMARKS, JSON.stringify(benchmarks));
  },

  async addBenchmark(benchmark: Omit<Benchmark, "id" | "createdAt">): Promise<Benchmark> {
    const benchmarks = await this.getBenchmarks();
    const newBenchmark: Benchmark = {
      ...benchmark,
      id: generateId(),
      createdAt: new Date().toISOString(),
    };
    benchmarks.push(newBenchmark);
    await this.setBenchmarks(benchmarks);
    return newBenchmark;
  },

  async updateBenchmark(id: string, updates: Partial<Omit<Benchmark, "id" | "createdAt">>): Promise<Benchmark | null> {
    const benchmarks = await this.getBenchmarks();
    const index = benchmarks.findIndex((b) => b.id === id);
    if (index === -1) return null;
    
    benchmarks[index] = { ...benchmarks[index], ...updates };
    await this.setBenchmarks(benchmarks);
    return benchmarks[index];
  },

  async deleteBenchmark(id: string): Promise<void> {
    const benchmarks = await this.getBenchmarks();
    const filtered = benchmarks.filter((b) => b.id !== id);
    await this.setBenchmarks(filtered);
    
    const actions = await this.getElementalActions();
    const actionIdsToDelete = actions.filter((a) => a.benchmarkId === id).map((a) => a.id);
    const filteredActions = actions.filter((a) => a.benchmarkId !== id);
    await this.setElementalActions(filteredActions);
    
    const dailyLogs = await this.getDailyLogs();
    const filteredLogs = dailyLogs.filter((l) => !actionIdsToDelete.includes(l.actionId));
    await this.setDailyLogs(filteredLogs);
  },

  async getElementalActions(): Promise<ElementalAction[]> {
    const value = await AsyncStorage.getItem(STORAGE_KEYS.ELEMENTAL_ACTIONS);
    return value ? JSON.parse(value) : [];
  },

  async setElementalActions(actions: ElementalAction[]): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEYS.ELEMENTAL_ACTIONS, JSON.stringify(actions));
  },

  async addElementalAction(action: Omit<ElementalAction, "id" | "createdAt">): Promise<ElementalAction> {
    const actions = await this.getElementalActions();
    const newAction: ElementalAction = {
      ...action,
      id: generateId(),
      createdAt: new Date().toISOString(),
    };
    actions.push(newAction);
    await this.setElementalActions(actions);
    return newAction;
  },

  async updateElementalAction(id: string, updates: Partial<Omit<ElementalAction, "id" | "createdAt">>): Promise<ElementalAction | null> {
    const actions = await this.getElementalActions();
    const index = actions.findIndex((a) => a.id === id);
    if (index === -1) return null;
    
    actions[index] = { ...actions[index], ...updates };
    await this.setElementalActions(actions);
    return actions[index];
  },

  async deleteElementalAction(id: string): Promise<void> {
    const actions = await this.getElementalActions();
    const filtered = actions.filter((a) => a.id !== id);
    await this.setElementalActions(filtered);
    
    const dailyLogs = await this.getDailyLogs();
    const filteredLogs = dailyLogs.filter((l) => l.actionId !== id);
    await this.setDailyLogs(filteredLogs);
  },

  async getDailyLogs(): Promise<DailyLog[]> {
    const value = await AsyncStorage.getItem(STORAGE_KEYS.DAILY_LOGS);
    return value ? JSON.parse(value) : [];
  },

  async setDailyLogs(logs: DailyLog[]): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEYS.DAILY_LOGS, JSON.stringify(logs));
  },

  async toggleDailyLog(actionId: string, date: string): Promise<DailyLog> {
    const logs = await this.getDailyLogs();
    const dateStr = date.includes("T") ? date.split("T")[0] : date;
    
    const existingIndex = logs.findIndex(
      (log) => {
        const logDateStr = log.logDate.includes("T") ? log.logDate.split("T")[0] : log.logDate;
        return log.actionId === actionId && logDateStr === dateStr;
      }
    );

    if (existingIndex >= 0) {
      logs[existingIndex].status = !logs[existingIndex].status;
      await this.setDailyLogs(logs);
      return logs[existingIndex];
    } else {
      const newLog: DailyLog = {
        id: generateId(),
        actionId,
        logDate: dateStr,
        status: true,
        createdAt: new Date().toISOString(),
      };
      logs.push(newLog);
      await this.setDailyLogs(logs);
      return newLog;
    }
  },

  async getLogForDate(actionId: string, date: string): Promise<DailyLog | null> {
    const logs = await this.getDailyLogs();
    const dateStr = date.split("T")[0];
    return logs.find(
      (log) => log.actionId === actionId && log.logDate.split("T")[0] === dateStr
    ) || null;
  },

  async getReflections(): Promise<Reflection[]> {
    const value = await AsyncStorage.getItem(STORAGE_KEYS.REFLECTIONS);
    return value ? JSON.parse(value) : [];
  },

  async addReflection(reflection: Omit<Reflection, "id" | "createdAt">): Promise<Reflection> {
    const reflections = await this.getReflections();
    const newReflection: Reflection = {
      ...reflection,
      id: generateId(),
      createdAt: new Date().toISOString(),
    };
    reflections.push(newReflection);
    await AsyncStorage.setItem(STORAGE_KEYS.REFLECTIONS, JSON.stringify(reflections));
    return newReflection;
  },

  async getOnboardingMessages(): Promise<ChatMessage[]> {
    const value = await AsyncStorage.getItem(STORAGE_KEYS.ONBOARDING_MESSAGES);
    return value ? JSON.parse(value) : [];
  },

  async setOnboardingMessages(messages: ChatMessage[]): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEYS.ONBOARDING_MESSAGES, JSON.stringify(messages));
  },

  async clearAll(): Promise<void> {
    await AsyncStorage.multiRemove(Object.values(STORAGE_KEYS));
  },

  async getSubscription(): Promise<Subscription> {
    const value = await AsyncStorage.getItem(STORAGE_KEYS.SUBSCRIPTION);
    if (value) return JSON.parse(value);
    return { isPremium: false, plan: "free", expiresAt: null, purchasedAt: null };
  },

  async setSubscription(subscription: Subscription): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEYS.SUBSCRIPTION, JSON.stringify(subscription));
  },

  async getMonthlyReflectionCount(): Promise<MonthlyReflectionCount> {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const value = await AsyncStorage.getItem(STORAGE_KEYS.MONTHLY_REFLECTION_COUNT);
    if (value) {
      const data = JSON.parse(value);
      if (data.month === currentMonth) return data;
    }
    return { month: currentMonth, count: 0 };
  },

  async incrementReflectionCount(): Promise<number> {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const data = await this.getMonthlyReflectionCount();
    if (data.month !== currentMonth) {
      data.month = currentMonth;
      data.count = 0;
    }
    data.count += 1;
    await AsyncStorage.setItem(STORAGE_KEYS.MONTHLY_REFLECTION_COUNT, JSON.stringify(data));
    return data.count;
  },

  async calculateMomentumScore(days: number = 7): Promise<number> {
    const logs = await this.getDailyLogs();
    const actions = await this.getElementalActions();
    
    if (actions.length === 0) return 0;

    const today = new Date();
    let totalExpected = 0;
    let totalCompleted = 0;

    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];
      const dayOfWeek = date.toLocaleDateString("en-US", { weekday: "long" });

      for (const action of actions) {
        if (action.frequency.includes(dayOfWeek)) {
          totalExpected++;
          const log = logs.find(
            (l) => l.actionId === action.id && l.logDate.split("T")[0] === dateStr
          );
          if (log?.status) {
            totalCompleted++;
          }
        }
      }
    }

    return totalExpected > 0 ? Math.round((totalCompleted / totalExpected) * 100) : 0;
  },

  async getPersonaAlignmentScore(): Promise<number> {
    return this.calculateMomentumScore(30);
  },

  async getDeviceId(): Promise<string> {
    let deviceId = await AsyncStorage.getItem(STORAGE_KEYS.DEVICE_ID);
    if (!deviceId) {
      deviceId = generateId() + "-" + generateId();
      await AsyncStorage.setItem(STORAGE_KEYS.DEVICE_ID, deviceId);
    }
    return deviceId;
  },

  async getStripeCustomerId(): Promise<string | null> {
    return AsyncStorage.getItem(STORAGE_KEYS.STRIPE_CUSTOMER_ID);
  },

  async setStripeCustomerId(customerId: string): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEYS.STRIPE_CUSTOMER_ID, customerId);
  },
};
