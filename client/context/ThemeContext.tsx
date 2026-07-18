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
export type AccentStyle = "cyan" | "violet";

const THEME_MODE_KEY = "app_theme_mode";
const ACCENT_STYLE_KEY = "app_accent_style";

interface ThemeContextValue {
  theme: typeof Colors.dark;
  isDark: boolean;
  mode: ThemeMode;
  accentStyle: AccentStyle;
  setMode: (mode: ThemeMode) => void;
  setAccentStyle: (style: AccentStyle) => void;
}

const defaultValue: ThemeContextValue = {
  theme: Colors.dark,
  isDark: true,
  mode: "midnight",
  accentStyle: "cyan",
  setMode: () => {},
  setAccentStyle: () => {},
};

const ThemeContext = createContext<ThemeContextValue>(defaultValue);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("midnight");
  const [accentStyle, setAccentStyleState] = useState<AccentStyle>("cyan");

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(THEME_MODE_KEY),
      AsyncStorage.getItem(ACCENT_STYLE_KEY),
    ])
      .then(([storedMode, storedAccent]) => {
        if (storedMode === "dawn") setModeState("dawn");
        if (storedAccent === "violet") setAccentStyleState("violet");
      })
      .catch(() => {});
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    AsyncStorage.setItem(THEME_MODE_KEY, next).catch(() => {});
  }, []);

  const setAccentStyle = useCallback((next: AccentStyle) => {
    setAccentStyleState(next);
    AsyncStorage.setItem(ACCENT_STYLE_KEY, next).catch(() => {});
  }, []);

  const theme = useMemo(() => {
    const base = mode === "dawn" ? Colors.light : Colors.dark;
    if (accentStyle === "cyan") return base;
    const accent = mode === "dawn" ? "#5E2F9E" : "#BFA1FF";
    return {
      ...base,
      accent,
      link: accent,
      tabIconSelected: accent,
    };
  }, [accentStyle, mode]);

  const value = useMemo(
    () => ({
      theme,
      isDark: mode !== "dawn",
      mode,
      accentStyle,
      setMode,
      setAccentStyle,
    }),
    [accentStyle, mode, setAccentStyle, setMode, theme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

/** Full theme state incl. the mode setter (Profile's Appearance row). */
export function useThemeMode(): ThemeContextValue {
  return useContext(ThemeContext);
}
