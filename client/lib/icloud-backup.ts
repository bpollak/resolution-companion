import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { requireNativeModule } from "expo-modules-core";

const CLOUD_KEY = "resolution_companion_private_backup_v1";
const MAX_BACKUP_BYTES = 900_000;
const BACKUP_ENABLED_KEY = "icloud_backup_enabled";
const LAST_BACKUP_KEY = "icloud_backup_last_at";

// Entitlement and anonymous server identity stay device/store-derived. The
// backup contains only the user's local product data and preferences.
const EXCLUDED_KEYS = new Set([
  "subscription",
  "deviceId",
  "telemetryQueue",
  "telemetryLastFlush",
  "yearly_price_cohort_v1",
  "icloud_backup_enabled",
  "icloud_backup_last_at",
]);

interface ICloudNativeModule {
  isICloudAvailable(): boolean;
  getICloudItem(key: string): string | null;
  setICloudItem(key: string, value: string): void;
  removeICloudItem(key: string): void;
  synchronizeICloud(): boolean;
}

let nativeModule: ICloudNativeModule | null = null;

function getNative(): ICloudNativeModule | null {
  if (Platform.OS !== "ios") return null;
  if (nativeModule) return nativeModule;
  try {
    nativeModule = requireNativeModule<ICloudNativeModule>("AppGroupStorage");
    return nativeModule;
  } catch {
    return null;
  }
}

export interface PrivateBackup {
  schemaVersion: 1;
  createdAt: string;
  values: Record<string, string>;
}

export interface BackupSummary {
  createdAt: string;
  itemCount: number;
  byteCount: number;
}

export function parsePrivateBackup(raw: string): PrivateBackup {
  const parsed = JSON.parse(raw) as Partial<PrivateBackup>;
  if (
    parsed.schemaVersion !== 1 ||
    typeof parsed.createdAt !== "string" ||
    !parsed.values ||
    typeof parsed.values !== "object" ||
    Array.isArray(parsed.values)
  ) {
    throw new Error("This iCloud backup is not a supported format.");
  }
  for (const [key, value] of Object.entries(parsed.values)) {
    if (
      EXCLUDED_KEYS.has(key) ||
      key.length === 0 ||
      key.length > 200 ||
      typeof value !== "string"
    ) {
      throw new Error("This iCloud backup contains unsupported data.");
    }
  }
  const backup = parsed as PrivateBackup;
  if (summarizePrivateBackup(backup).byteCount > MAX_BACKUP_BYTES) {
    throw new Error("This iCloud backup is too large to restore safely.");
  }
  return backup;
}

export function summarizePrivateBackup(backup: PrivateBackup): BackupSummary {
  const serialized = JSON.stringify(backup);
  return {
    createdAt: backup.createdAt,
    itemCount: Object.keys(backup.values).length,
    byteCount: new TextEncoder().encode(serialized).length,
  };
}

export async function isPrivateBackupAvailable(): Promise<boolean> {
  return getNative()?.isICloudAvailable() === true;
}

export async function createPrivateBackup(
  now: Date = new Date(),
): Promise<BackupSummary> {
  const native = getNative();
  if (!native?.isICloudAvailable()) {
    throw new Error("Sign in to iCloud on this device to use private backup.");
  }
  const keys = (await AsyncStorage.getAllKeys()).filter(
    (key) => !EXCLUDED_KEYS.has(key),
  );
  const pairs = await AsyncStorage.multiGet(keys);
  const values: Record<string, string> = {};
  for (const [key, value] of pairs) {
    if (value !== null) values[key] = value;
  }
  const backup: PrivateBackup = {
    schemaVersion: 1,
    createdAt: now.toISOString(),
    values,
  };
  const summary = summarizePrivateBackup(backup);
  if (summary.byteCount > MAX_BACKUP_BYTES) {
    throw new Error(
      "Your data is too large for iCloud key-value backup. Nothing was overwritten.",
    );
  }
  native.setICloudItem(CLOUD_KEY, JSON.stringify(backup));
  native.synchronizeICloud();
  await AsyncStorage.setItem(LAST_BACKUP_KEY, backup.createdAt);
  return summary;
}

export async function getPrivateBackupSummary(): Promise<BackupSummary | null> {
  const native = getNative();
  if (!native?.isICloudAvailable()) return null;
  native.synchronizeICloud();
  const raw = native.getICloudItem(CLOUD_KEY);
  return raw ? summarizePrivateBackup(parsePrivateBackup(raw)) : null;
}

export async function restorePrivateBackup(): Promise<BackupSummary> {
  const native = getNative();
  if (!native?.isICloudAvailable()) {
    throw new Error("Sign in to iCloud on this device to restore a backup.");
  }
  native.synchronizeICloud();
  const raw = native.getICloudItem(CLOUD_KEY);
  if (!raw) throw new Error("No Resolution Companion backup was found.");
  const backup = parsePrivateBackup(raw);
  const summary = summarizePrivateBackup(backup);
  const currentKeys = (await AsyncStorage.getAllKeys()).filter(
    (key) => !EXCLUDED_KEYS.has(key),
  );
  const backedUpKeys = new Set(Object.keys(backup.values));
  const staleKeys = currentKeys.filter((key) => !backedUpKeys.has(key));
  await AsyncStorage.multiSet(Object.entries(backup.values));
  if (staleKeys.length > 0) await AsyncStorage.multiRemove(staleKeys);
  return summary;
}

export async function deletePrivateBackup(): Promise<void> {
  const native = getNative();
  if (native?.isICloudAvailable()) {
    native.removeICloudItem(CLOUD_KEY);
    native.synchronizeICloud();
  }
  await AsyncStorage.multiRemove([BACKUP_ENABLED_KEY, LAST_BACKUP_KEY]);
}

export async function getPrivateBackupEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(BACKUP_ENABLED_KEY)) === "true";
}

export async function setPrivateBackupEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(BACKUP_ENABLED_KEY, String(enabled));
}

export async function getLastPrivateBackupAt(): Promise<string | null> {
  return AsyncStorage.getItem(LAST_BACKUP_KEY);
}
