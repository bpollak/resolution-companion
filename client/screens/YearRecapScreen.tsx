import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ViewShot from "react-native-view-shot";
import * as Haptics from "expo-haptics";
import { useApp } from "@/context/AppContext";
import { useTheme } from "@/hooks/useTheme";
import { ThemedText } from "@/components/ThemedText";
import { BorderRadius, Spacing, Typography } from "@/constants/theme";
import { buildYearRecap, type YearRecap } from "@/lib/recap";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";
import { track } from "@/lib/telemetry";

type CardKind = "opening" | "rhythm" | "resilience" | "closing";
const cards: CardKind[] = ["opening", "rhythm", "resilience", "closing"];

function cardAccessibilityLabel(recap: YearRecap, kind: CardKind): string {
  if (kind === "opening") {
    return `${recap.yearLabel}. ${recap.votesCast} votes for ${recap.personaName} across ${recap.activeDays} active days. Every vote made the identity a little more real.`;
  }
  if (kind === "rhythm") {
    return `${recap.consistency}% consistency across ${recap.activeMonths} active ${recap.activeMonths === 1 ? "month" : "months"}. ${recap.bestMonth ? `${recap.bestMonth.monthLabel} led the year with ${recap.bestMonth.votesCast} votes.` : "Your first vote can still write the story."}`;
  }
  if (kind === "resilience") {
    return `The plan bent with you. ${recap.kickstartVotes} floor saves, ${recap.comebacks} comebacks, ${recap.healthVotes} Health auto-votes, ${recap.shieldsEarned} shields earned, and ${recap.shieldedDays} days protected.`;
  }
  return `${recap.yearLabel}, still becoming. ${recap.closingLine} No rankings. No perfect year required. Just evidence that you returned.`;
}

function YearCard({ recap, kind }: { recap: YearRecap; kind: CardKind }) {
  const { theme } = useTheme();
  if (kind === "opening")
    return (
      <>
        <ThemedText maxFontSizeMultiplier={1} style={styles.eyebrow}>
          THE YEAR YOU BECAME · {recap.yearLabel}
        </ThemedText>
        <ThemedText
          maxFontSizeMultiplier={1}
          style={[styles.big, { color: theme.accent }]}
        >
          {recap.votesCast}
        </ThemedText>
        <ThemedText maxFontSizeMultiplier={1} style={styles.headline}>
          votes for {recap.personaName}
        </ThemedText>
        <ThemedText maxFontSizeMultiplier={1} style={styles.sub}>
          Across {recap.activeDays} active days, every vote made the identity a
          little more real.
        </ThemedText>
      </>
    );
  if (kind === "rhythm")
    return (
      <>
        <ThemedText maxFontSizeMultiplier={1} style={styles.eyebrow}>
          YOUR RHYTHM
        </ThemedText>
        <ThemedText
          maxFontSizeMultiplier={1}
          style={[styles.big, { color: theme.success }]}
        >
          {recap.consistency}%
        </ThemedText>
        <ThemedText maxFontSizeMultiplier={1} style={styles.headline}>
          {recap.activeMonths} active{" "}
          {recap.activeMonths === 1 ? "month" : "months"}
        </ThemedText>
        <ThemedText maxFontSizeMultiplier={1} style={styles.sub}>
          {recap.bestMonth
            ? `${recap.bestMonth.monthLabel} led the year with ${recap.bestMonth.votesCast} votes.`
            : "Your first vote can still write the story."}
        </ThemedText>
      </>
    );
  if (kind === "resilience")
    return (
      <>
        <ThemedText maxFontSizeMultiplier={1} style={styles.eyebrow}>
          THE PLAN BENT WITH YOU
        </ThemedText>
        <View style={styles.pair}>
          <View style={styles.stat}>
            <ThemedText
              maxFontSizeMultiplier={1}
              style={[styles.mid, { color: theme.warning }]}
            >
              {recap.kickstartVotes}
            </ThemedText>
            <ThemedText maxFontSizeMultiplier={1} style={styles.sub}>
              floor saves
            </ThemedText>
          </View>
          <View style={styles.stat}>
            <ThemedText
              maxFontSizeMultiplier={1}
              style={[styles.mid, { color: theme.success }]}
            >
              {recap.comebacks}
            </ThemedText>
            <ThemedText maxFontSizeMultiplier={1} style={styles.sub}>
              comebacks
            </ThemedText>
          </View>
        </View>
        <ThemedText maxFontSizeMultiplier={1} style={styles.sub}>
          {recap.healthVotes} Health auto-votes · {recap.shieldsEarned} shields
          earned · {recap.shieldedDays} days protected
        </ThemedText>
      </>
    );
  return (
    <>
      <ThemedText maxFontSizeMultiplier={1} style={styles.eyebrow}>
        {recap.yearLabel}, STILL BECOMING
      </ThemedText>
      <MaterialCommunityIcons
        name="compass-outline"
        size={58}
        color={theme.accent}
      />
      <ThemedText maxFontSizeMultiplier={1} style={styles.headline}>
        {recap.closingLine}
      </ThemedText>
      <ThemedText maxFontSizeMultiplier={1} style={styles.sub}>
        No rankings. No perfect year required. Just evidence that you returned.
      </ThemedText>
    </>
  );
}

export default function YearRecapScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, "YearRecap">>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { theme } = useTheme();
  const { actions, dailyLogs, persona, subscription } = useApp();
  const [index, setIndex] = useState(0);
  const refs = useRef<Map<number, ViewShot | null>>(new Map());
  const recap = useMemo(
    () =>
      buildYearRecap(
        actions,
        dailyLogs,
        persona,
        route.params.year,
        new Date(),
        2,
      ),
    [actions, dailyLogs, persona, route.params.year],
  );
  useEffect(() => {
    if (!subscription.isPremium) {
      navigation.goBack();
      navigation.navigate("Subscription" as never);
    }
  }, [navigation, subscription.isPremium]);
  const cardWidth = width - Spacing["3xl"] * 2;
  const share = async () => {
    const shot = refs.current.get(index);
    if (!shot?.capture) return;
    if (Platform.OS !== "web") Haptics.selectionAsync();
    const uri = await shot.capture();
    await Share.share(
      Platform.OS === "ios"
        ? { url: uri }
        : { url: uri, message: "The Year You Became — Resolution Companion" },
    );
    track("year_recap_shared");
  };
  if (!subscription.isPremium) {
    return null;
  }
  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.backgroundRoot,
          paddingTop: insets.top + Spacing.lg,
          paddingBottom: insets.bottom + Spacing.lg,
        },
      ]}
    >
      <View style={styles.header}>
        <ThemedText accessibilityRole="header" style={styles.title}>
          The Year You Became
        </ThemedText>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          pressRetentionOffset={16}
          accessibilityRole="button"
          accessibilityLabel="Close year recap"
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <Feather name="x" size={22} color={theme.text} />
        </Pressable>
      </View>
      <FlatList
        data={cards}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={cardWidth + Spacing.lg}
        contentContainerStyle={{ paddingHorizontal: Spacing["3xl"] }}
        keyExtractor={(item) => item}
        onMomentumScrollEnd={(event) =>
          setIndex(
            Math.min(
              cards.length - 1,
              Math.max(
                0,
                Math.round(
                  event.nativeEvent.contentOffset.x / (cardWidth + Spacing.lg),
                ),
              ),
            ),
          )
        }
        renderItem={({ item, index: cardIndex }) => (
          <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={cardAccessibilityLabel(recap, item)}
            style={{ width: cardWidth, marginRight: Spacing.lg }}
          >
            <ViewShot
              ref={(ref) => {
                refs.current.set(cardIndex, ref);
              }}
              options={{ format: "png", quality: 1 }}
              style={styles.card}
            >
              <YearCard recap={recap} kind={item} />
              <View style={styles.brand}>
                <MaterialCommunityIcons
                  name="compass-outline"
                  size={14}
                  color={theme.accent}
                />
                <ThemedText maxFontSizeMultiplier={1} style={styles.brandText}>
                  Resolution Companion
                </ThemedText>
              </View>
            </ViewShot>
          </View>
        )}
      />
      <View style={styles.footer}>
        <View style={styles.dots}>
          {cards.map((card, cardIndex) => (
            <View
              key={card}
              style={[
                styles.dot,
                {
                  backgroundColor:
                    cardIndex === index
                      ? theme.accent
                      : theme.backgroundTertiary,
                },
              ]}
            />
          ))}
        </View>
        <Pressable
          onPress={share}
          accessibilityRole="button"
          accessibilityLabel="Share this year recap card as an image"
          style={({ pressed }) => [
            styles.share,
            { backgroundColor: theme.accent, opacity: pressed ? 0.8 : 1 },
          ]}
        >
          <Feather name="share" size={16} color={theme.buttonText} />
          <ThemedText style={[styles.shareText, { color: theme.buttonText }]}>
            Share this card
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing["3xl"],
    marginBottom: Spacing.xl,
  },
  title: { ...Typography.title, flex: 1 },
  card: {
    flex: 1,
    backgroundColor: "#0f0f1a",
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(0,217,255,0.3)",
    padding: Spacing["3xl"],
    paddingBottom: 56,
    justifyContent: "center",
    gap: Spacing.md,
  },
  eyebrow: {
    ...Typography.caption,
    color: "#A0A0A0",
    letterSpacing: 1.2,
    fontWeight: "600",
  },
  big: { fontSize: 72, fontWeight: "800", lineHeight: 78 },
  mid: { fontSize: 42, fontWeight: "700" },
  headline: { ...Typography.h3, lineHeight: 32 },
  sub: { ...Typography.body, color: "#C6C6C6", lineHeight: 24 },
  pair: { flexDirection: "row", gap: Spacing.xl },
  stat: { flex: 1 },
  brand: {
    position: "absolute",
    bottom: Spacing.lg,
    left: Spacing["3xl"],
    flexDirection: "row",
    gap: Spacing.xs,
    alignItems: "center",
  },
  brandText: { ...Typography.caption, color: "#A0A0A0" },
  footer: { alignItems: "center", gap: Spacing.lg, paddingTop: Spacing.lg },
  dots: { flexDirection: "row", gap: Spacing.sm },
  dot: { width: 7, height: 7, borderRadius: 4 },
  share: {
    minHeight: 48,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.xl,
    flexDirection: "row",
    gap: Spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  shareText: { ...Typography.headline },
});
