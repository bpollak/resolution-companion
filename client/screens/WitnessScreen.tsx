import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  TextInput,
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
import { computeWeeklyRecap } from "@/lib/progress";
import {
  buildWitnessCelebration,
  getWitnessSettings,
  setWitnessSettings,
} from "@/lib/witness";
import { track } from "@/lib/telemetry";

export default function WitnessScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { actions, dailyLogs, persona } = useApp();
  const [name, setName] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const recap = useMemo(
    () => computeWeeklyRecap(actions, dailyLogs),
    [actions, dailyLogs],
  );
  const message = useMemo(
    () =>
      buildWitnessCelebration(
        name,
        persona,
        recap.lastWeek.completed,
        recap.lastWeek.score,
      ),
    [name, persona, recap],
  );

  useEffect(() => {
    getWitnessSettings().then((settings) => {
      setName(settings.name);
      setEnabled(settings.enabled);
      setLoaded(true);
    });
  }, []);

  const save = async (nextEnabled = enabled) => {
    const next = await setWitnessSettings({ name, enabled: nextEnabled });
    setName(next.name);
    setEnabled(next.enabled);
    if (Platform.OS !== "web") Haptics.selectionAsync();
  };

  const share = async () => {
    await save(true);
    await Share.share({ message });
    track("witness_progress_shared");
  };

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
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
          accessibilityLabel="Close witness settings"
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <Feather name="x" size={24} color={theme.text} />
        </Pressable>
        <ThemedText accessibilityRole="header" style={styles.title}>
          Someone in Your Corner
        </ThemedText>
        <View style={{ width: 24 }} />
      </View>

      <ThemedText style={[styles.intro, { color: theme.textSecondary }]}>
        Choose one trusted person who can celebrate progress with you. Nothing
        is sent automatically. There are no feeds, rankings, consequences, or
        shared accounts—you choose every message in the system share sheet.
      </ThemedText>

      <ThemedText style={styles.label}>Witness name</ThemedText>
      <TextInput
        value={name}
        onChangeText={setName}
        onBlur={() => save()}
        maxLength={60}
        placeholder="For example, Maya"
        placeholderTextColor={theme.textSecondary}
        accessibilityLabel="Witness name"
        style={[
          styles.input,
          {
            color: theme.text,
            backgroundColor: theme.backgroundSecondary,
            borderColor: theme.border,
          },
        ]}
      />

      <View
        style={[styles.toggleRow, { backgroundColor: theme.cardBackground }]}
      >
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.rowTitle}>Celebration prompts</ThemedText>
          <ThemedText style={[styles.rowSub, { color: theme.textSecondary }]}>
            Keep the weekly share shortcut available
          </ThemedText>
        </View>
        <Switch
          value={enabled}
          disabled={!loaded || name.trim().length === 0}
          onValueChange={(value) => save(value)}
          accessibilityRole="switch"
          accessibilityLabel="Celebration prompts"
          accessibilityState={{
            checked: enabled,
            disabled: !loaded || name.trim().length === 0,
          }}
          trackColor={{ false: theme.backgroundTertiary, true: theme.accent }}
          thumbColor="#FFFFFF"
        />
      </View>

      <View
        accessible
        accessibilityLabel={`Message preview. ${message}`}
        style={[styles.preview, { borderColor: theme.border }]}
      >
        <ThemedText style={styles.previewTitle}>This week’s preview</ThemedText>
        <ThemedText
          style={[styles.previewText, { color: theme.textSecondary }]}
        >
          {message}
        </ThemedText>
      </View>

      <Pressable
        disabled={!name.trim()}
        onPress={() =>
          share().catch(() =>
            Alert.alert("Sharing unavailable", "Please try again."),
          )
        }
        accessibilityRole="button"
        accessibilityLabel="Share this week's celebration"
        accessibilityState={{ disabled: !name.trim() }}
        style={({ pressed }) => [
          styles.primary,
          {
            backgroundColor: theme.accent,
            opacity: !name.trim() ? 0.4 : pressed ? 0.8 : 1,
          },
        ]}
      >
        <Feather name="send" size={18} color={theme.buttonText} />
        <ThemedText style={[styles.primaryText, { color: theme.buttonText }]}>
          Share celebration
        </ThemedText>
      </Pressable>
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
  intro: { ...Typography.body, lineHeight: 24, marginBottom: Spacing["2xl"] },
  label: { ...Typography.headline, marginBottom: Spacing.sm },
  input: {
    minHeight: 52,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.lg,
    fontSize: 17,
    marginBottom: Spacing.lg,
  },
  toggleRow: {
    minHeight: 72,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  rowTitle: { ...Typography.body, fontWeight: "600" },
  rowSub: { ...Typography.caption, marginTop: 3 },
  preview: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
  },
  previewTitle: { ...Typography.headline, marginBottom: Spacing.sm },
  previewText: { ...Typography.body, lineHeight: 24 },
  primary: {
    minHeight: 52,
    marginTop: Spacing.xl,
    borderRadius: BorderRadius.full,
    flexDirection: "row",
    gap: Spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { ...Typography.headline },
});
