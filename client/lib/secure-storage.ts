import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform, NativeModules } from "react-native";
import { logger } from "./logger";

/**
 * Keychain/Keystore-backed storage for items that carry security or billing
 * weight — the device id (treated as a bearer token by the subscription
 * endpoints) and the local subscription snapshot. Falls back to AsyncStorage
 * on web and in Expo Go, where the native module isn't linked.
 */

let SecureStore: typeof import("expo-secure-store") | null = null;
let attemptedLoad = false;

async function loadSecureStore(): Promise<typeof import("expo-secure-store") | null> {
  if (SecureStore || attemptedLoad) return SecureStore;
  attemptedLoad = true;

  if (Platform.OS === "web") return null;
  if (!NativeModules.ExpoSecureStore && !NativeModules.RNSSecureStore) {
    return null;
  }

  try {
    SecureStore = await import("expo-secure-store");
    return SecureStore;
  } catch (error) {
    logger.warn("expo-secure-store not available, falling back to AsyncStorage", error);
    return null;
  }
}

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const store = await loadSecureStore();
    if (store) {
      try {
        return await store.getItemAsync(key);
      } catch (error) {
        logger.warn("SecureStore getItem failed, falling back to AsyncStorage", error);
      }
    }
    return AsyncStorage.getItem(key);
  },

  async setItem(key: string, value: string): Promise<void> {
    const store = await loadSecureStore();
    if (store) {
      try {
        await store.setItemAsync(key, value);
        // Clear any legacy AsyncStorage copy so there's one source of truth.
        await AsyncStorage.removeItem(key).catch(() => {});
        return;
      } catch (error) {
        logger.warn("SecureStore setItem failed, falling back to AsyncStorage", error);
      }
    }
    await AsyncStorage.setItem(key, value);
  },

  async removeItem(key: string): Promise<void> {
    const store = await loadSecureStore();
    if (store) {
      try {
        await store.deleteItemAsync(key);
      } catch (error) {
        logger.warn("SecureStore deleteItem failed", error);
      }
    }
    await AsyncStorage.removeItem(key).catch(() => {});
  },
};
