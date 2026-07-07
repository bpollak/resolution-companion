import React from "react";
import { Pressable } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import MainTabNavigator from "@/navigation/MainTabNavigator";
import OnboardingScreen from "@/screens/OnboardingScreen";
import BenchmarkEditorScreen from "@/screens/BenchmarkEditorScreen";
import ActionEditorScreen from "@/screens/ActionEditorScreen";
import SubscriptionScreen from "@/screens/SubscriptionScreen";
import ProfileScreen from "@/screens/ProfileScreen";
import { useScreenOptions } from "@/hooks/useScreenOptions";
import { useTheme } from "@/hooks/useTheme";
import { Spacing } from "@/constants/theme";

export type RootStackParamList = {
  Main: undefined;
  Onboarding: undefined;
  BenchmarkEditor: { benchmarkId?: string };
  ActionEditor: { benchmarkId: string; actionId?: string };
  Subscription: undefined;
  Profile: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootStackNavigator() {
  const screenOptions = useScreenOptions();
  const { theme } = useTheme();

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen
        name="Main"
        component={MainTabNavigator}
        options={{ headerShown: false }}
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
              hitSlop={8}
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
