import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo-modules-core";

const AURORA_ICON_NAME = "AuroraIcon";

export type AppIconStyle = "default" | "aurora";

interface AlternateIconNativeModule {
  supportsAlternateIcons(): boolean;
  getAlternateIconName(): string | null;
  setAlternateIconName(name: string | null): Promise<boolean>;
}

function getNative(): AlternateIconNativeModule | null {
  if (Platform.OS !== "ios") return null;
  return requireOptionalNativeModule<AlternateIconNativeModule>(
    "AppGroupStorage",
  );
}

export function supportsAlternateAppIcons(): boolean {
  try {
    return getNative()?.supportsAlternateIcons() === true;
  } catch {
    return false;
  }
}

export function getAppIconStyle(): AppIconStyle {
  try {
    return getNative()?.getAlternateIconName() === AURORA_ICON_NAME
      ? "aurora"
      : "default";
  } catch {
    return "default";
  }
}

export async function setAppIconStyle(style: AppIconStyle): Promise<boolean> {
  try {
    const native = getNative();
    if (!native?.supportsAlternateIcons()) return false;
    return await native.setAlternateIconName(
      style === "aurora" ? AURORA_ICON_NAME : null,
    );
  } catch {
    return false;
  }
}
