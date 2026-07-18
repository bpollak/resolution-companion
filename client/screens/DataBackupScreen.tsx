import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useApp } from "@/context/AppContext";
import { useTheme } from "@/hooks/useTheme";
import { ThemedText } from "@/components/ThemedText";
import { BorderRadius, Spacing, Typography } from "@/constants/theme";
import {
  createPrivateBackup,
  deletePrivateBackup,
  getLastPrivateBackupAt,
  getPrivateBackupEnabled,
  getPrivateBackupSummary,
  isPrivateBackupAvailable,
  restorePrivateBackup,
  setPrivateBackupEnabled,
  type BackupSummary,
} from "@/lib/icloud-backup";
import { track } from "@/lib/telemetry";

function formatDate(value: string | null): string {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

export default function DataBackupScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { refreshData } = useApp();
  const [available, setAvailable] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [lastAt, setLastAt] = useState<string | null>(null);
  const [cloud, setCloud] = useState<BackupSummary | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [isAvailable, isEnabled, last, summary] = await Promise.all([
      isPrivateBackupAvailable(),
      getPrivateBackupEnabled(),
      getLastPrivateBackupAt(),
      getPrivateBackupSummary(),
    ]);
    setAvailable(isAvailable);
    setEnabled(isEnabled);
    setLastAt(last);
    setCloud(summary);
  }, []);

  useEffect(() => {
    refresh().catch(() => {});
  }, [refresh]);

  const backUp = async () => {
    setBusy(true);
    try {
      const summary = await createPrivateBackup();
      await setPrivateBackupEnabled(true);
      setEnabled(true);
      setLastAt(summary.createdAt);
      setCloud(summary);
      track("icloud_backup_created");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        "Backup Complete",
        "Your private iCloud backup is up to date.",
      );
    } catch (error) {
      Alert.alert(
        "Backup unavailable",
        error instanceof Error ? error.message : "Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  const confirmRestore = () => {
    if (!cloud) {
      Alert.alert(
        "No Backup Found",
        "There is no Resolution Companion backup in iCloud.",
      );
      return;
    }
    Alert.alert(
      "Restore Private Backup?",
      `This replaces local app data with the backup from ${formatDate(cloud.createdAt)}. Your App Store subscription remains unchanged.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Restore",
          onPress: async () => {
            setBusy(true);
            try {
              await restorePrivateBackup();
              await refreshData();
              track("icloud_backup_restored");
              Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Success,
              );
              Alert.alert(
                "Restore Complete",
                "Your local data now matches the iCloud backup.",
              );
            } catch (error) {
              Alert.alert(
                "Restore unavailable",
                error instanceof Error ? error.message : "Please try again.",
              );
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  const confirmDeleteBackup = () => {
    Alert.alert(
      "Delete iCloud Backup?",
      "This permanently removes the Resolution Companion backup from your iCloud. Data on this device stays in place.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Backup",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            try {
              await deletePrivateBackup();
              setEnabled(false);
              setCloud(null);
              setLastAt(null);
              Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Warning,
              );
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.backgroundRoot }}
      contentContainerStyle={{
        paddingTop: insets.top + Spacing.lg,
        paddingBottom: insets.bottom + Spacing["3xl"],
        paddingHorizontal: Spacing.lg,
      }}
    >
      <View style={styles.header}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          pressRetentionOffset={16}
          accessibilityRole="button"
          accessibilityLabel="Close private backup"
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <Feather name="x" size={24} color={theme.text} />
        </Pressable>
        <ThemedText accessibilityRole="header" style={styles.title}>
          Private iCloud Backup
        </ThemedText>
        <View style={{ width: 24 }} />
      </View>

      <View style={[styles.hero, { backgroundColor: theme.cardBackground }]}>
        <Feather name="cloud" size={36} color={theme.accent} />
        <ThemedText style={styles.heroTitle}>
          Your data, in your iCloud
        </ThemedText>
        <ThemedText style={[styles.body, { color: theme.textSecondary }]}>
          Personas, actions, votes, and reflections are copied to your private
          iCloud key-value store. Resolution Companion does not receive or read
          the backup. Subscription and anonymous device identifiers are
          excluded.
        </ThemedText>
      </View>

      <View style={[styles.row, { borderColor: theme.border }]}>
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.rowTitle}>Backup enabled</ThemedText>
          <ThemedText style={[styles.rowSub, { color: theme.textSecondary }]}>
            {available
              ? `Last backup: ${formatDate(lastAt)}`
              : "Sign in to iCloud to enable"}
          </ThemedText>
        </View>
        <Switch
          value={enabled}
          disabled={!available || busy}
          onValueChange={async (value) => {
            if (value) await backUp();
            else {
              await setPrivateBackupEnabled(false);
              setEnabled(false);
            }
          }}
          accessibilityRole="switch"
          accessibilityLabel="Private iCloud backup"
          accessibilityState={{
            checked: enabled,
            disabled: !available || busy,
          }}
          trackColor={{ false: theme.backgroundTertiary, true: theme.accent }}
          thumbColor="#FFFFFF"
        />
      </View>

      <Pressable
        onPress={backUp}
        disabled={!available || busy}
        accessibilityRole="button"
        accessibilityLabel="Back up now"
        accessibilityState={{ disabled: !available || busy }}
        style={({ pressed }) => [
          styles.button,
          {
            backgroundColor: theme.accent,
            opacity: !available || busy ? 0.4 : pressed ? 0.8 : 1,
          },
        ]}
      >
        <ThemedText style={[styles.buttonText, { color: theme.buttonText }]}>
          {busy ? "Working…" : "Back Up Now"}
        </ThemedText>
      </Pressable>
      <Pressable
        onPress={confirmRestore}
        disabled={!available || !cloud || busy}
        accessibilityRole="button"
        accessibilityLabel="Restore from iCloud backup"
        accessibilityHint="Requires confirmation before replacing local data"
        accessibilityState={{ disabled: !available || !cloud || busy }}
        style={({ pressed }) => [
          styles.outlineButton,
          {
            borderColor: theme.accent,
            opacity: !available || !cloud || busy ? 0.4 : pressed ? 0.7 : 1,
          },
        ]}
      >
        <ThemedText style={[styles.buttonText, { color: theme.accent }]}>
          Restore Backup
        </ThemedText>
      </Pressable>
      {cloud ? (
        <>
          <ThemedText
            style={[styles.cloudSummary, { color: theme.textSecondary }]}
          >
            Backup available from {formatDate(cloud.createdAt)} ·{" "}
            {cloud.itemCount} local records
          </ThemedText>
          <Pressable
            onPress={confirmDeleteBackup}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Delete private iCloud backup"
            accessibilityHint="Requires confirmation and keeps data on this device"
            accessibilityState={{ disabled: busy }}
            style={({ pressed }) => [
              styles.deleteButton,
              { opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <ThemedText style={{ color: theme.error }}>
              Delete iCloud Backup
            </ThemedText>
          </Pressable>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  title: { ...Typography.title, flex: 1, textAlign: "center" },
  hero: {
    borderRadius: BorderRadius.md,
    padding: Spacing.xl,
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  heroTitle: { ...Typography.headline },
  body: { ...Typography.body, lineHeight: 24 },
  row: {
    minHeight: 76,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  rowTitle: { ...Typography.body, fontWeight: "600" },
  rowSub: { ...Typography.caption, marginTop: 4 },
  button: {
    minHeight: 52,
    borderRadius: BorderRadius.full,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  outlineButton: {
    minHeight: 52,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonText: { ...Typography.headline },
  cloudSummary: {
    ...Typography.caption,
    textAlign: "center",
    marginTop: Spacing.lg,
  },
  deleteButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
});
