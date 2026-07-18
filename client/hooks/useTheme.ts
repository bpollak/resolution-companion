import { useThemeMode } from "@/context/ThemeContext";

// Thin wrapper so every existing `useTheme()` call site picks up the
// ThemeProvider (midnight by default; "dawn" once unlocked and chosen in
// Profile → Appearance). Outside a provider it falls back to the dark theme
// via the context default.
export function useTheme() {
  const { theme, isDark } = useThemeMode();

  return {
    theme,
    isDark,
  };
}
