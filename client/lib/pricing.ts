import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { storage } from "@/lib/storage";

const COHORT_KEY = "yearly_price_cohort_v1";

export interface YearlyPricingConfig {
  alternateProductId: string | null;
  newCohortStartsAt: string | null;
}

export function getYearlyPricingConfig(): YearlyPricingConfig {
  const extra = Constants.expoConfig?.extra as
    | { yearlyPriceTestProductId?: string; yearlyPriceTestStartsAt?: string }
    | undefined;
  return {
    alternateProductId: extra?.yearlyPriceTestProductId?.trim() || null,
    newCohortStartsAt: extra?.yearlyPriceTestStartsAt?.trim() || null,
  };
}

function stableBucket(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Existing installs and existing purchasers always keep the base yearly SKU.
 * Only installs whose first persona was created after the configured start
 * can enter the test, and the anonymous device id makes assignment stable.
 */
export async function chooseYearlyProductId(
  baseProductId: string,
  availableProductIds: string[],
  config: YearlyPricingConfig = getYearlyPricingConfig(),
): Promise<string> {
  if (
    !config.alternateProductId ||
    !config.newCohortStartsAt ||
    !availableProductIds.includes(config.alternateProductId)
  ) {
    return baseProductId;
  }
  const subscription = await storage.getSubscription();
  if (subscription.purchasedAt) return baseProductId;
  const personas = await storage.getPersonas();
  const firstCreatedAt = personas.map((persona) => persona.createdAt).sort()[0];
  if (!firstCreatedAt || firstCreatedAt < config.newCohortStartsAt) {
    return baseProductId;
  }
  const stored = await AsyncStorage.getItem(COHORT_KEY);
  if (stored === "base") return baseProductId;
  if (stored === "alternate") return config.alternateProductId;
  const deviceId = await storage.getDeviceId();
  const cohort = stableBucket(deviceId) % 2 === 0 ? "base" : "alternate";
  await AsyncStorage.setItem(COHORT_KEY, cohort);
  return cohort === "alternate" ? config.alternateProductId : baseProductId;
}
