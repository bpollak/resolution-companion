import React, { useState, useEffect } from "react";
import { View, ScrollView, StyleSheet, Pressable, Alert, Platform, Switch, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { useTheme } from "@/hooks/useTheme";
import { useApp } from "@/context/AppContext";
import { Colors, Spacing, Typography, BorderRadius } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { getApiUrl } from "@/lib/query-client";
import { storage } from "@/lib/storage";
import {
  requestNotificationPermissions,
  scheduleDailyReminder,
  cancelDailyReminder,
  areNotificationsEnabled,
  getNotificationPermissionStatus,
} from "@/lib/notifications";

const springConfig = {
  damping: 15,
  stiffness: 400,
  mass: 0.8,
};

interface SettingsRowProps {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  subtitle?: string;
  onPress: () => void;
  destructive?: boolean;
}

function SettingsRow({ icon, title, subtitle, onPress, destructive }: SettingsRowProps) {
  const { theme, isDark } = useTheme();
  const scale = useSharedValue(1);
  const chevronX = useSharedValue(0);

  const handlePressIn = () => {
    scale.value = withSpring(0.98, springConfig);
    chevronX.value = withSpring(3, springConfig);
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, springConfig);
    chevronX.value = withSpring(0, springConfig);
  };

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: chevronX.value }],
  }));

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <Animated.View
        style={[
          styles.settingsRow,
          {
            backgroundColor: isDark
              ? Colors.dark.backgroundDefault
              : Colors.light.backgroundDefault,
          },
          animatedStyle,
        ]}
      >
        <View
          style={[
            styles.settingsIcon,
            {
              backgroundColor: destructive
                ? "rgba(255, 107, 107, 0.1)"
                : "rgba(0, 217, 255, 0.1)",
            },
          ]}
        >
          <Feather
            name={icon}
            size={20}
            color={destructive ? Colors.dark.error : Colors.dark.accent}
          />
        </View>
        <View style={styles.settingsContent}>
          <ThemedText
            style={[
              styles.settingsTitle,
              destructive && { color: Colors.dark.error },
            ]}
          >
            {title}
          </ThemedText>
          {subtitle ? (
            <ThemedText style={[styles.settingsSubtitle, { color: theme.textSecondary }]}>
              {subtitle}
            </ThemedText>
          ) : null}
        </View>
        <Animated.View style={chevronStyle}>
          <Feather name="chevron-right" size={20} color={theme.textSecondary} />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const navigation = useNavigation<any>();
  const { theme, isDark } = useTheme();
  const { hasOnboarded, persona, personas, benchmarks, actions, reflections, clearAllData, switchPersona, deletePersona, subscription, canAddPersona, monthlyReflectionCount } = useApp();

  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);

  useEffect(() => {
    const checkNotificationStatus = async () => {
      const [enabled, permission] = await Promise.all([
        areNotificationsEnabled(),
        getNotificationPermissionStatus(),
      ]);
      setNotificationsEnabled(enabled);
      setHasPermission(permission);
    };
    checkNotificationStatus();
  }, []);

  const handleToggleNotifications = async (value: boolean) => {
    const isWeb = Platform.OS as string === "web";
    if (isWeb) {
      window.alert("Notifications are only available in Expo Go on your mobile device.");
      return;
    }

    if (value) {
      const granted = await requestNotificationPermissions();
      if (granted) {
        await scheduleDailyReminder(20, 0);
        setNotificationsEnabled(true);
        setHasPermission(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        setHasPermission(false);
        Alert.alert(
          "Permission Required",
          "Please enable notifications in your device settings to receive daily reminders.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Open Settings",
              onPress: async () => {
                try {
                  await Linking.openSettings();
                } catch {
                }
              },
            },
          ]
        );
      }
    } else {
      await cancelDailyReminder();
      setNotificationsEnabled(false);
      Haptics.selectionAsync();
    }
  };

  const showAlert = (
    title: string,
    message: string,
    buttons: { text: string; onPress?: () => void; style?: string }[]
  ) => {
    if (Platform.OS === "web") {
      const confirmButton = buttons.find((b) => b.style === "destructive" || b.text !== "Cancel");
      if (confirmButton && window.confirm(`${title}\n\n${message}`)) {
        confirmButton.onPress?.();
      }
    } else {
      Alert.alert(title, message, buttons as any);
    }
  };

  const handleAddNewPersona = () => {
    if (!canAddPersona()) {
      navigation.navigate("Subscription");
      return;
    }
    navigation.navigate("Onboarding");
  };

  const handleSwitchPersona = async (id: string) => {
    await switchPersona(id);
    if (Platform.OS !== "web") {
      Haptics.selectionAsync();
    }
  };

  const handleDeletePersona = (id: string, name: string) => {
    if (personas.length <= 1) {
      if (Platform.OS === "web") {
        window.alert("You must have at least one persona. Create a new one first before deleting this one.");
      } else {
        Alert.alert("Cannot Delete", "You must have at least one persona. Create a new one first before deleting this one.");
      }
      return;
    }

    showAlert(
      "Delete Persona",
      `Delete "${name}"? This will also remove all benchmarks, actions, and logs for this persona.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deletePersona(id);
            if (Platform.OS !== "web") {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            }
          },
        },
      ]
    );
  };

  const handleClearData = () => {
    showAlert(
      "Clear All Data",
      "This will permanently delete all your data including all personas, benchmarks, actions, and logs. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Everything",
          style: "destructive",
          onPress: async () => {
            await clearAllData();
            if (Platform.OS === "web") {
              window.alert("All your data has been deleted.");
            } else {
              Alert.alert("Data Cleared", "All your data has been deleted.");
            }
          },
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    showAlert(
      "Delete All My Data",
      "This will permanently delete ALL your data, both on this device and on our servers (including subscription records). This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Everything",
          style: "destructive",
          onPress: async () => {
            try {
              const deviceId = await storage.getDeviceId();
              await fetch(new URL(`/api/user-data/${deviceId}`, getApiUrl()).toString(), {
                method: "DELETE",
              });
              await clearAllData();
              if (Platform.OS === "web") {
                window.alert("All your data has been deleted from this device and our servers.");
              } else {
                Alert.alert("Account Deleted", "All your data has been deleted from this device and our servers.");
              }
            } catch (error) {
              console.error("Failed to delete server data:", error);
              await clearAllData();
              if (Platform.OS === "web") {
                window.alert("Local data deleted. Server data deletion may have failed — please contact support if needed.");
              } else {
                Alert.alert("Partial Deletion", "Local data deleted. Server data deletion may have failed — please contact support if needed.");
              }
            }
          },
        },
      ]
    );
  };

  const currentPersonaBenchmarks = benchmarks.filter((b) => b.personaId === persona?.id);
  const currentPersonaActions = actions.filter((a) => 
    currentPersonaBenchmarks.some((b) => b.id === a.benchmarkId)
  );

  const stats = [
    { label: "Benchmarks", value: currentPersonaBenchmarks.length },
    { label: "Actions", value: currentPersonaActions.length },
    { label: "Coaching", value: reflections.length },
  ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
      contentContainerStyle={{
        paddingTop: headerHeight + Spacing.xl,
        paddingBottom: tabBarHeight + Spacing.xl,
        paddingHorizontal: Spacing.lg,
      }}
      scrollIndicatorInsets={{ bottom: insets.bottom }}
    >
      {hasOnboarded && persona ? (
        <View
          style={[
            styles.profileCard,
            { backgroundColor: isDark ? Colors.dark.backgroundDefault : Colors.light.backgroundDefault },
          ]}
        >
          <View style={styles.avatarContainer}>
            <View style={[styles.avatar, { backgroundColor: Colors.dark.accent }]}>
              <Feather name="user" size={32} color="#000000" />
            </View>
          </View>
          <ThemedText style={styles.personaName}>{persona.name}</ThemedText>
          {persona.description ? (
            <ThemedText style={[styles.personaDescription, { color: theme.textSecondary }]}>
              {persona.description}
            </ThemedText>
          ) : null}
          
          <View style={styles.statsRow}>
            {stats.map((stat) => (
              <View key={stat.label} style={styles.statItem}>
                <ThemedText style={[styles.statValue, { color: Colors.dark.accent }]}>
                  {stat.value}
                </ThemedText>
                <ThemedText style={[styles.statLabel, { color: theme.textSecondary }]}>
                  {stat.label}
                </ThemedText>
              </View>
            ))}
          </View>
        </View>
      ) : (
        <View
          style={[
            styles.profileCard,
            { backgroundColor: isDark ? Colors.dark.backgroundDefault : Colors.light.backgroundDefault },
          ]}
        >
          <View style={styles.avatarContainer}>
            <View style={[styles.avatar, { backgroundColor: theme.backgroundSecondary }]}>
              <Feather name="user" size={32} color={theme.textSecondary} />
            </View>
          </View>
          <ThemedText style={[styles.notOnboarded, { color: theme.textSecondary }]}>
            Complete onboarding to define your persona
          </ThemedText>
          <Pressable
            onPress={() => navigation.navigate("Onboarding")}
            style={({ pressed }) => [
              styles.onboardButton,
              { opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <ThemedText style={styles.onboardButtonText}>Start Journey</ThemedText>
          </Pressable>
        </View>
      )}

      {personas.length > 0 ? (
        <>
          <View style={styles.sectionHeader}>
            <ThemedText style={styles.sectionTitle}>My Personas</ThemedText>
            <Pressable
              onPress={handleAddNewPersona}
              style={({ pressed }) => [styles.addPersonaButton, { opacity: pressed ? 0.7 : 1 }]}
            >
              {!canAddPersona() ? (
                <Feather name="lock" size={14} color={Colors.dark.accent} />
              ) : (
                <Feather name="plus" size={18} color={Colors.dark.accent} />
              )}
              <ThemedText style={[styles.addPersonaText, { color: Colors.dark.accent }]}>
                {canAddPersona() ? "Add" : "PRO"}
              </ThemedText>
            </Pressable>
          </View>

          <View style={styles.personasList}>
            {personas.map((p) => (
              <Pressable
                key={p.id}
                onPress={() => handleSwitchPersona(p.id)}
                onLongPress={() => handleDeletePersona(p.id, p.name)}
                style={({ pressed }) => [
                  styles.personaItem,
                  {
                    backgroundColor: isDark ? Colors.dark.backgroundDefault : Colors.light.backgroundDefault,
                    borderColor: p.id === persona?.id ? Colors.dark.accent : "transparent",
                    borderWidth: 2,
                    opacity: pressed ? 0.8 : 1,
                  },
                ]}
              >
                <View style={[
                  styles.personaItemAvatar,
                  { backgroundColor: p.id === persona?.id ? Colors.dark.accent : theme.backgroundSecondary }
                ]}>
                  <Feather name="user" size={16} color={p.id === persona?.id ? "#000000" : theme.textSecondary} />
                </View>
                <View style={styles.personaItemContent}>
                  <ThemedText style={styles.personaItemName}>{p.name}</ThemedText>
                  {p.id === persona?.id ? (
                    <ThemedText style={[styles.personaItemBadge, { color: Colors.dark.accent }]}>
                      Active
                    </ThemedText>
                  ) : null}
                </View>
                {p.id !== persona?.id ? (
                  <Pressable
                    onPress={() => handleDeletePersona(p.id, p.name)}
                    hitSlop={8}
                    style={({ pressed }) => [{ opacity: pressed ? 0.5 : 1 }]}
                  >
                    <Feather name="trash-2" size={18} color={Colors.dark.error} />
                  </Pressable>
                ) : null}
              </Pressable>
            ))}
          </View>

          <View style={styles.personaHintContainer}>
            <View style={styles.personaHintRow}>
              <Feather name="repeat" size={14} color={theme.textSecondary} />
              <ThemedText style={[styles.personaHint, { color: theme.textSecondary }]}>
                Tap to switch
              </ThemedText>
            </View>
            <View style={styles.personaHintRow}>
              <Feather name="trash-2" size={14} color={theme.textSecondary} />
              <ThemedText style={[styles.personaHint, { color: theme.textSecondary }]}>
                Tap trash icon to delete
              </ThemedText>
            </View>
          </View>
        </>
      ) : null}

      <ThemedText style={[styles.sectionTitle, { marginTop: Spacing.xl }]}>Settings</ThemedText>

      <SettingsRow
        icon={subscription.isPremium ? "check-circle" : "zap"}
        title={subscription.isPremium ? "Premium Active" : "Upgrade to Premium"}
        subtitle={subscription.isPremium 
          ? `${subscription.plan === "yearly" ? "Yearly" : "Monthly"} plan` 
          : monthlyReflectionCount >= 10 
            ? "Check-in limit reached" 
            : `${10 - monthlyReflectionCount} check-ins left this month`}
        onPress={() => navigation.navigate("Subscription")}
      />

      <View
        style={[
          styles.settingsRow,
          {
            backgroundColor: isDark
              ? Colors.dark.backgroundDefault
              : Colors.light.backgroundDefault,
          },
        ]}
      >
        <View
          style={[
            styles.settingsIcon,
            { backgroundColor: "rgba(0, 217, 255, 0.1)" },
          ]}
        >
          <Feather name="bell" size={20} color={Colors.dark.accent} />
        </View>
        <View style={styles.settingsContent}>
          <ThemedText style={styles.settingsTitle}>Daily Reminders</ThemedText>
          <ThemedText style={[styles.settingsSubtitle, { color: theme.textSecondary }]}>
            {Platform.OS === "web" 
              ? "Available on mobile" 
              : notificationsEnabled 
                ? "Reminder at 8:00 PM" 
                : "Off"}
          </ThemedText>
        </View>
        <Switch
          value={notificationsEnabled}
          onValueChange={handleToggleNotifications}
          trackColor={{ false: theme.backgroundSecondary, true: Colors.dark.accent }}
          thumbColor={notificationsEnabled ? "#FFFFFF" : "#FFFFFF"}
          disabled={Platform.OS === "web"}
        />
      </View>

      <SettingsRow
        icon="info"
        title="About Resolution Companion"
        subtitle="Version 1.0.0"
        onPress={() => {
          if (Platform.OS === "web") {
            window.alert("Resolution Companion is your AI-powered partner for achieving your resolutions. It helps you define who you want to become and builds personalized daily habits to get you there.");
          } else {
            Alert.alert(
              "About Resolution Companion",
              "Resolution Companion is your AI-powered partner for achieving your resolutions. It helps you define who you want to become and builds personalized daily habits to get you there."
            );
          }
        }}
      />

      {hasOnboarded ? (
        <>
          <ThemedText style={[styles.sectionTitle, { marginTop: Spacing.xl }]}>
            Danger Zone
          </ThemedText>

          <SettingsRow
            icon="trash-2"
            title="Clear All Data"
            subtitle="Delete local data and start fresh"
            onPress={handleClearData}
            destructive
          />

          <SettingsRow
            icon="user-minus"
            title="Delete My Account & Data"
            subtitle="Remove all data from device and servers"
            onPress={handleDeleteAccount}
            destructive
          />
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  profileCard: {
    padding: Spacing.xl,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  avatarContainer: {
    marginBottom: Spacing.lg,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  personaName: {
    ...Typography.title,
    textAlign: "center",
    marginBottom: Spacing.xs,
  },
  personaDescription: {
    ...Typography.body,
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  notOnboarded: {
    ...Typography.body,
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  statsRow: {
    flexDirection: "row",
    width: "100%",
    justifyContent: "space-around",
    paddingTop: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  statItem: {
    alignItems: "center",
  },
  statValue: {
    ...Typography.title,
  },
  statLabel: {
    ...Typography.caption,
  },
  onboardButton: {
    backgroundColor: Colors.dark.accent,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing["2xl"],
    borderRadius: BorderRadius.full,
  },
  onboardButtonText: {
    ...Typography.headline,
    color: "#000000",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    ...Typography.headline,
  },
  addPersonaButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  addPersonaText: {
    ...Typography.small,
    fontWeight: "600",
  },
  personasList: {
    gap: Spacing.sm,
  },
  personaItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  personaItemAvatar: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  personaItemContent: {
    flex: 1,
  },
  personaItemName: {
    ...Typography.body,
    fontWeight: "500",
  },
  personaItemBadge: {
    ...Typography.caption,
    fontWeight: "600",
  },
  personaHintContainer: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.xl,
    marginTop: Spacing.md,
    marginBottom: Spacing.lg,
  },
  personaHintRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  personaHint: {
    ...Typography.caption,
  },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  settingsIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  settingsContent: {
    flex: 1,
  },
  settingsTitle: {
    ...Typography.body,
    fontWeight: "500",
  },
  settingsSubtitle: {
    ...Typography.caption,
    marginTop: 2,
  },
});
