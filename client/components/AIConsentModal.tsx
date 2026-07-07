import React from "react";
import {
  StyleSheet,
  View,
  Pressable,
  ScrollView,
  Modal,
  Linking,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { useTheme } from "@/hooks/useTheme";
import { Spacing, BorderRadius } from "@/constants/theme";
import { getApiUrl } from "@/lib/query-client";

interface DisclosureItem {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  text: string;
}

// Apple guideline 5.1.1(i)/5.1.2(i): before any data is sent to a third-party
// AI service, the app must disclose what is sent and to whom, and obtain the
// user's permission. Every AI entry point must show this modal before its
// first request when consent has not been granted.
const DISCLOSURE_ITEMS: DisclosureItem[] = [
  {
    icon: "send",
    title: "What is shared",
    text: "The messages you type in AI conversations — your goals, check-in answers, and replies — are sent to generate coaching responses.",
  },
  {
    icon: "cpu",
    title: "Who receives it",
    text: "Your messages are processed by OpenAI, the third-party service that powers AI coaching. We don't store your conversations on our servers.",
  },
  {
    icon: "user-x",
    title: "Not tied to your identity",
    text: "No account is required and your conversations are not used to identify you or for advertising.",
  },
  {
    icon: "sliders",
    title: "You're in control",
    text: "You can turn AI data sharing off anytime in Profile. Habit tracking works fully without it.",
  },
];

interface AIConsentModalProps {
  visible: boolean;
  onAgree: () => void;
  onDecline: () => void;
}

export function AIConsentModal({
  visible,
  onAgree,
  onDecline,
}: AIConsentModalProps) {
  const { theme } = useTheme();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onDecline}
    >
      <View style={styles.overlay}>
        <ThemedView style={styles.container}>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View
              style={[styles.heroIcon, { backgroundColor: theme.link + "20" }]}
            >
              <Feather name="message-circle" size={28} color={theme.link} />
            </View>

            <ThemedText type="h2" style={styles.title}>
              AI Coaching & Your Data
            </ThemedText>
            <ThemedText
              style={[styles.subtitle, { color: theme.textSecondary }]}
            >
              Before you chat with your AI coach, here&apos;s exactly what
              happens with your data.
            </ThemedText>

            {DISCLOSURE_ITEMS.map((item) => (
              <View key={item.title} style={styles.itemRow}>
                <View
                  style={[
                    styles.itemIcon,
                    { backgroundColor: theme.backgroundDefault },
                  ]}
                >
                  <Feather name={item.icon} size={18} color={theme.link} />
                </View>
                <View style={styles.itemTextContainer}>
                  <ThemedText style={styles.itemTitle}>{item.title}</ThemedText>
                  <ThemedText
                    style={[styles.itemText, { color: theme.textSecondary }]}
                  >
                    {item.text}
                  </ThemedText>
                </View>
              </View>
            ))}

            <Pressable
              onPress={() =>
                Linking.openURL(new URL("/privacy", getApiUrl()).toString())
              }
              style={({ pressed }) => [
                styles.privacyLink,
                { opacity: pressed ? 0.6 : 1 },
              ]}
              accessibilityRole="link"
              accessibilityLabel="Read our Privacy Policy"
            >
              <Feather name="external-link" size={14} color={theme.link} />
              <ThemedText
                style={[styles.privacyLinkText, { color: theme.link }]}
              >
                Read our Privacy Policy
              </ThemedText>
            </Pressable>
          </ScrollView>

          <View style={styles.footer}>
            <Pressable
              onPress={onAgree}
              style={({ pressed }) => [
                styles.agreeButton,
                { backgroundColor: theme.link, opacity: pressed ? 0.9 : 1 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Agree and continue"
            >
              <ThemedText
                style={[styles.agreeButtonText, { color: theme.buttonText }]}
              >
                Agree & Continue
              </ThemedText>
            </Pressable>
            <Pressable
              onPress={onDecline}
              style={({ pressed }) => [
                styles.declineButton,
                { opacity: pressed ? 0.6 : 1 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Not now"
            >
              <ThemedText
                style={[
                  styles.declineButtonText,
                  { color: theme.textSecondary },
                ]}
              >
                Not Now
              </ThemedText>
            </Pressable>
          </View>
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  container: {
    width: "100%",
    maxHeight: "90%",
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
  },
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    padding: Spacing["2xl"],
    paddingBottom: Spacing.md,
  },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: Spacing.lg,
  },
  title: {
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  subtitle: {
    textAlign: "center",
    marginBottom: Spacing.xl,
    lineHeight: 20,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: Spacing.lg,
    gap: Spacing.md,
  },
  itemIcon: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  itemTextContainer: {
    flex: 1,
  },
  itemTitle: {
    fontWeight: "600",
    marginBottom: 2,
  },
  itemText: {
    fontSize: 13,
    lineHeight: 18,
  },
  privacyLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
  },
  privacyLinkText: {
    fontSize: 14,
    fontWeight: "500",
  },
  footer: {
    padding: Spacing["2xl"],
    paddingTop: Spacing.sm,
    gap: Spacing.sm,
  },
  agreeButton: {
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: "center",
  },
  agreeButtonText: {
    fontWeight: "600",
    fontSize: 16,
  },
  declineButton: {
    paddingVertical: Spacing.md,
    alignItems: "center",
  },
  declineButtonText: {
    fontSize: 15,
  },
});
