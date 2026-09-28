import React from "react";
import { StyleSheet } from "react-native";
import * as Linking from "expo-linking";
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  type LinkingOptions,
  type Theme as NavigationTheme,
} from "@react-navigation/native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";

import RootStackNavigator, {
  type RootStackParamList,
} from "@/navigation/RootStackNavigator";
import { navigationRef } from "@/navigation/navigationRef";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { OfflineBanner } from "@/components/OfflineBanner";
import { MilestoneCelebrationHost } from "@/components/MilestoneCompleteModal";
import { AppProvider } from "@/context/AppContext";
import { ThemeProvider, useThemeMode } from "@/context/ThemeContext";

// Navigation's default theme paints a white background, which flashed on
// launch before the first screen rendered on the dark-first app.
function useNavigationTheme(): NavigationTheme {
  const { theme, isDark } = useThemeMode();
  return React.useMemo(() => {
    const base = isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        background: theme.backgroundRoot,
        card: theme.backgroundRoot,
        primary: theme.accent,
      },
    };
  }, [isDark, theme]);
}

function ThemedRoot({ children }: { children: React.ReactNode }) {
  const { theme } = useThemeMode();
  return (
    <GestureHandlerRootView
      style={[styles.root, { backgroundColor: theme.backgroundRoot }]}
    >
      {children}
    </GestureHandlerRootView>
  );
}

function ThemedNavigation({ children }: { children: React.ReactNode }) {
  const navigationTheme = useNavigationTheme();
  return (
    <NavigationContainer
      ref={navigationRef}
      linking={linking}
      theme={navigationTheme}
    >
      {children}
    </NavigationContainer>
  );
}

function ThemedStatusBar() {
  const { isDark } = useThemeMode();
  return <StatusBar style={isDark ? "light" : "dark"} />;
}

// resolutioncompanion:// deep links land the widget body-tap and notification
// taps on the tab they're about instead of whatever was last open
const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [Linking.createURL("/"), "resolutioncompanion://"],
  config: {
    screens: {
      Main: {
        screens: {
          TodayTab: "today",
          JourneyTab: "journey",
          ReflectTab: "coach",
        },
      },
    },
  },
};

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AppProvider>
            <SafeAreaProvider>
              <ThemedRoot>
                <KeyboardProvider>
                  <ThemedNavigation>
                    <OfflineBanner />
                    <RootStackNavigator />
                    {/* Milestone celebrations overlay whichever screen the
                        completion flip happened on */}
                    <MilestoneCelebrationHost />
                  </ThemedNavigation>
                  <ThemedStatusBar />
                </KeyboardProvider>
              </ThemedRoot>
            </SafeAreaProvider>
          </AppProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
