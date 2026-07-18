import React from "react";
import { StyleSheet } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";

import RootStackNavigator from "@/navigation/RootStackNavigator";
import { navigationRef } from "@/navigation/navigationRef";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { OfflineBanner } from "@/components/OfflineBanner";
import { MilestoneCelebrationHost } from "@/components/MilestoneCompleteModal";
import { AppProvider } from "@/context/AppContext";
import { ThemeProvider, useThemeMode } from "@/context/ThemeContext";

function ThemedStatusBar() {
  const { isDark } = useThemeMode();
  return <StatusBar style={isDark ? "light" : "dark"} />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AppProvider>
            <SafeAreaProvider>
              <GestureHandlerRootView style={styles.root}>
                <KeyboardProvider>
                  <NavigationContainer ref={navigationRef}>
                    <OfflineBanner />
                    <RootStackNavigator />
                    {/* Milestone celebrations overlay whichever screen the
                        completion flip happened on */}
                    <MilestoneCelebrationHost />
                  </NavigationContainer>
                  <ThemedStatusBar />
                </KeyboardProvider>
              </GestureHandlerRootView>
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
