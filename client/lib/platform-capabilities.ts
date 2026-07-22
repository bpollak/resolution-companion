import { Platform } from "react-native";

export interface PlatformCapabilities {
  storeName: "App Store" | "Google Play" | "web";
  storeAccountName: "Apple Account" | "Google Play account" | "account";
  supportsHealthAutoComplete: boolean;
  supportsPrivateCloudBackup: boolean;
  supportsHomeScreenWidget: boolean;
  supportsAlternateAppIcons: boolean;
}

export function getPlatformCapabilities(
  os: typeof Platform.OS = Platform.OS,
): PlatformCapabilities {
  if (os === "ios") {
    return {
      storeName: "App Store",
      storeAccountName: "Apple Account",
      supportsHealthAutoComplete: true,
      supportsPrivateCloudBackup: true,
      supportsHomeScreenWidget: true,
      supportsAlternateAppIcons: true,
    };
  }
  if (os === "android") {
    return {
      storeName: "Google Play",
      storeAccountName: "Google Play account",
      supportsHealthAutoComplete: false,
      supportsPrivateCloudBackup: false,
      supportsHomeScreenWidget: false,
      supportsAlternateAppIcons: false,
    };
  }
  return {
    storeName: "web",
    storeAccountName: "account",
    supportsHealthAutoComplete: false,
    supportsPrivateCloudBackup: false,
    supportsHomeScreenWidget: false,
    supportsAlternateAppIcons: false,
  };
}

export const platformCapabilities = getPlatformCapabilities();
