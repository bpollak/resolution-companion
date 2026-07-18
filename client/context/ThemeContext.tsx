import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useCallback,
  ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Colors } from "@/constants/theme";

/**
 * App-wide theme mode. "midnight" is the shipped dark-first identity;
 * "dawn" is the light palette, unlocked as a milestone reward (the light
 * palette was fully built but unreachable — dead code shipped as delight).
 * The provider defaults to midnight and never flashes: dawn only applies
 * after the persisted preference loads.
 */

export type ThemeMode = "midnight" | "dawn";

const THEME_MODE_KEY = "app_theme_mode";

interface ThemeContextValue {
  theme: typeof Colors.dark;
  isDark: boolean;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

const defaultValue: ThemeContextValue = {
  theme: Colors.dark,
  isDark: true,
  mode: "midnight",
  setMode: () => {},
};

const ThemeContext = createContext<ThemeContextValue>(defaultValue);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("midnight");

  useEffect(() => {
    AsyncStorage.getItem(THEME_MODE_KEY)
      .then((value) => {
        if (value === "dawn") setModeState("dawn");
      })
      .catch(() => {});
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    AsyncStorage.setItem(THEME_MODE_KEY, next).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({
      theme: mode === "dawn" ? Colors.light : Colors.dark,
      isDark: mode !== "dawn",
      mode,
      setMode,
    }),
    [mode, setMode],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

/** Full theme state incl. the mode setter (Profile's Appearance row). */
export function useThemeMode(): ThemeContextValue {
  return useContext(ThemeContext);
}
