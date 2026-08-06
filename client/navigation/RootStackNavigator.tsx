import React from "react";
import { Platform, Pressable } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { NavigatorScreenParams } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import MainTabNavigator, {
  type MainTabParamList,
} from "@/navigation/MainTabNavigator";
import OnboardingScreen from "@/screens/OnboardingScreen";
import BenchmarkEditorScreen from "@/screens/BenchmarkEditorScreen";
import ActionEditorScreen from "@/screens/ActionEditorScreen";
import SubscriptionScreen from "@/screens/SubscriptionScreen";
import ProfileScreen from "@/screens/ProfileScreen";
import MonthRecapScreen from "@/screens/MonthRecapScreen";
import YearRecapScreen from "@/screens/YearRecapScreen";
import WitnessScreen from "@/screens/WitnessScreen";
import DataBackupScreen from "@/screens/DataBackupScreen";
import CoachSheetScreen from "@/screens/CoachSheetScreen";
import type { CoachEntryOrigin } from "@/lib/storage";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import { useTheme } from "@/hooks/useTheme";
import { Spacing } from "@/constants/theme";
import { getMainTabRootTopOffset } from "@/navigation/tab-bar-layout";

export type RootStackParamList = {
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  Onboarding: undefined;
  BenchmarkEditor: { benchmarkId?: string; suggestedTitle?: string };
  ActionEditor: { benchmarkId: string; actionId?: string };
  Subscription:
    | {
        source?:
          | "coach-limit"
          | "milestone-proposal"
          | "milestone-limit"
          | "insights"
          | "year-recap";
      }
    | undefined;
  Profile: undefined;
  MonthRecap: { monthKey: string };
  YearRecap: { year: number };
  Witness: undefined;
  DataBackup: undefined;
  CoachSheet: CoachSheetParams;
};

export type CoachPromptId =
  | "start-today"
  | "understand-pattern"
  | "reduce-friction"
  | "review-week"
  | "reflect-success";

export interface CoachSheetParams {
  origin: CoachEntryOrigin;
  promptId?: CoachPromptId;
  actionId?: string;
  benchmarkId?: string;
}

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootStackNavigator() {
  const screenOptions = useScreenOptions();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Main"
        component={MainTabNavigator}
        options={{
          headerShown: false,
          // The Android native stack already reserves its top safe area, and
          // the nested tab navigator otherwise receives that space a second
          // time. Pull only Main back by the live inset; iOS stays untouched.
          contentStyle:
            Platform.OS === "android"
              ? {
                  backgroundColor: theme.backgroundRoot,
                  marginTop: getMainTabRootTopOffset(Platform.OS, insets.top),
                }
              : undefined,
        }}
      />
      <Stack.Screen
        name="Onboarding"
        component={OnboardingScreen}
        options={{
          headerShown: false,
          presentation: "fullScreenModal",
        }}
      />
      <Stack.Screen
        name="BenchmarkEditor"
        component={BenchmarkEditorScreen}
        options={{
          headerShown: false,
          presentation: "modal",
        }}
      />
      <Stack.Screen
        name="ActionEditor"
        component={ActionEditorScreen}
        options={{
          headerShown: false,
          presentation: "modal",
        }}
      />
      <Stack.Screen
        name="Subscription"
        component={SubscriptionScreen}
        options={{
          headerShown: false,
          presentation: "modal",
        }}
      />
      <Stack.Screen
        name="MonthRecap"
        component={MonthRecapScreen}
        options={{
          headerShown: false,
          presentation: "modal",
        }}
      />
      <Stack.Screen
        name="YearRecap"
        component={YearRecapScreen}
        options={{ headerShown: false, presentation: "modal" }}
      />
      <Stack.Screen
        name="Witness"
        component={WitnessScreen}
        options={{ headerShown: false, presentation: "modal" }}
      />
      <Stack.Screen
        name="DataBackup"
        component={DataBackupScreen}
        options={{ headerShown: false, presentation: "modal" }}
      />
      <Stack.Screen
        name="CoachSheet"
        component={CoachSheetScreen}
        options={{
          headerShown: false,
          presentation: "formSheet",
          sheetAllowedDetents: [0.55, 0.94],
          sheetInitialDetentIndex: 0,
          sheetGrabberVisible: true,
          sheetCornerRadius: 28,
          // Dim the screen behind at every detent — undimmed background text
          // peeking past the sheet's corners reads as glitched overlap.
          // ("none" = no undimmed detents; numeric -1 is silently ignored.)
          sheetLargestUndimmedDetentIndex: "none",
          contentStyle: { backgroundColor: theme.backgroundRoot },
        }}
      />
      <Stack.Screen
        name="Profile"
        component={ProfileScreen}
        options={({ navigation }) => ({
          title: "Profile",
          presentation: "modal",
          // Native-stack modals render no back button, so give the screen an
          // explicit close affordance (the tab-era ProfileScreen has no
          // header of its own)
          headerLeft: () => (
            <Pressable
              onPress={() => navigation.goBack()}
              hitSlop={12}
              pressRetentionOffset={16}
              accessibilityRole="button"
              accessibilityLabel="Close profile"
              style={({ pressed }) => [
                { paddingHorizontal: Spacing.sm, opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <Feather name="x" size={22} color={theme.text} />
            </Pressable>
          ),
        })}
      />
    </Stack.Navigator>
  );
}
