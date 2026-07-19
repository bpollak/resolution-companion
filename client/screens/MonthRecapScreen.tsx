import React, { useMemo, useRef, useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  FlatList,
  Share,
  Platform,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import ViewShot from "react-native-view-shot";
import * as Haptics from "expo-haptics";

import { useApp } from "@/context/AppContext";
import { useTheme } from "@/hooks/useTheme";
import { ThemedText } from "@/components/ThemedText";
import { Spacing, BorderRadius, Typography } from "@/constants/theme";
import { buildMonthRecap, MonthRecap } from "@/lib/recap";
import type { RootStackParamList } from "@/navigation/RootStackNavigator";
import { track } from "@/lib/telemetry";
import { logger } from "@/lib/logger";
import { getRecapCoachLine } from "@/lib/ai";
import { storage } from "@/lib/storage";

/**
 * "Month in Votes" — a swipeable story of last month told the no-guilt way:
 * votes cast, when the user shows up, the comeback moment, shields earned,
 * and a closing line. Every card renders share-ready; sharing is an outbound
 * image only (no accounts, no feed — data never leaves the device except as
 * the picture the user chooses to send).
 */

type CardKind =
  | "votes"
  | "portrait"
  | "support"
  | "comeback"
  | "resilience"
  | "closing";

interface RecapCard {
  kind: CardKind;
}

function buildCards(): RecapCard[] {
  return [
    { kind: "votes" },
    { kind: "portrait" },
    { kind: "support" },
    { kind: "comeback" },
    { kind: "resilience" },
    { kind: "closing" },
  ];
}

function formatComebackDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });
}

function CardBody({ recap, kind }: { recap: MonthRecap; kind: CardKind }) {
  const { theme } = useTheme();

  switch (kind) {
    case "votes":
      return (
        <>
          <ThemedText style={styles.cardEyebrow}>{recap.monthLabel}</ThemedText>
          <ThemedText style={[styles.bigNumber, { color: theme.accent }]}>
            {recap.votesCast}
          </ThemedText>
          <ThemedText style={styles.cardHeadline}>
            {recap.votesCast === 1 ? "vote" : "votes"} for {recap.personaName}
          </ThemedText>
          <ThemedText style={styles.cardSub}>
            Every action was a vote for who you&rsquo;re becoming.
          </ThemedText>
        </>
      );
    case "portrait":
      return (
        <>
          <ThemedText style={styles.cardEyebrow}>
            Your consistency portrait
          </ThemedText>
          <ThemedText style={[styles.bigNumber, { color: theme.accent }]}>
            {recap.consistency}%
          </ThemedText>
          <ThemedText style={styles.cardHeadline}>
            across {recap.activeDays} active{" "}
            {recap.activeDays === 1 ? "day" : "days"}
          </ThemedText>
          <ThemedText style={styles.cardSub}>
            {recap.bestWeekday
              ? `${recap.bestWeekday}s${recap.bestTimeOfDay ? ` in the ${recap.bestTimeOfDay}` : ""} are when you show up most.`
              : "A fresh month is a fresh ballot."}
          </ThemedText>
        </>
      );
    case "support":
      return (
        <>
          <ThemedText style={styles.cardEyebrow}>
            The plan met you there
          </ThemedText>
          <View style={styles.statPair}>
            <View style={styles.statBlock}>
              <ThemedText style={[styles.midNumber, { color: theme.warning }]}>
                {recap.kickstartVotes}
              </ThemedText>
              <ThemedText style={styles.cardSub}>
                2-minute floor saves
              </ThemedText>
            </View>
            <View style={styles.statBlock}>
              <ThemedText style={[styles.midNumber, { color: theme.success }]}>
                {recap.healthVotes}
              </ThemedText>
              <ThemedText style={styles.cardSub}>Health auto-votes</ThemedText>
            </View>
          </View>
          <ThemedText style={styles.cardHeadline}>
            Small and automatic still count.
          </ThemedText>
          <ThemedText style={styles.cardSub}>
            The floor exists for real life. Every smaller version was still a
            vote for {recap.personaName}.
          </ThemedText>
        </>
      );
    case "comeback":
      return recap.comeback ? (
        <>
          <ThemedText style={styles.cardEyebrow}>The comeback</ThemedText>
          <MaterialCommunityIcons
            name="undo-variant"
            size={56}
            color={theme.success}
            style={styles.cardIcon}
          />
          <ThemedText style={styles.cardHeadline}>
            On {formatComebackDate(recap.comeback.date)} you came back after{" "}
            {recap.comeback.gapDays} days away
          </ThemedText>
          <ThemedText style={styles.cardSub}>
            Coming back is the whole skill. Streaks are easy — returns are rare.
          </ThemedText>
        </>
      ) : (
        <>
          <ThemedText style={styles.cardEyebrow}>The steady return</ThemedText>
          <MaterialCommunityIcons
            name="weather-sunset-up"
            size={56}
            color={theme.success}
            style={styles.cardIcon}
          />
          <ThemedText style={styles.cardHeadline}>
            You kept finding your way back.
          </ThemedText>
          <ThemedText style={styles.cardSub}>
            No dramatic comeback required. Quiet returns are how identity gets
            built.
          </ThemedText>
        </>
      );
    case "resilience":
      return (
        <>
          <ThemedText style={styles.cardEyebrow}>Built to bend</ThemedText>
          <View style={styles.statPair}>
            <View style={styles.statBlock}>
              <ThemedText style={[styles.midNumber, { color: theme.accent }]}>
                {recap.longestRun}
              </ThemedText>
              <ThemedText style={styles.cardSub}>
                days, your longest run
              </ThemedText>
            </View>
            <View style={styles.statBlock}>
              <ThemedText style={[styles.midNumber, { color: theme.warning }]}>
                {recap.shieldedDays} 🛡
              </ThemedText>
              <ThemedText style={styles.cardSub}>
                {recap.shieldedDays === 1 ? "day" : "days"} your shield covered
              </ThemedText>
            </View>
          </View>
          <ThemedText style={styles.cardSub}>
            You earned {recap.shieldsEarned} shield
            {recap.shieldsEarned === 1 ? "" : "s"} by showing up — forgiveness
            as a reward, not an apology.
          </ThemedText>
        </>
      );
    case "closing":
      return (
        <>
          <ThemedText style={styles.cardEyebrow}>
            {recap.monthLabel}, closed
          </ThemedText>
          <MaterialCommunityIcons
            name="compass-outline"
            size={56}
            color={theme.accent}
            style={styles.cardIcon}
          />
          <ThemedText style={styles.cardHeadline}>
            {recap.closingLine}
          </ThemedText>
          <ThemedText style={styles.cardSub}>
            New month, clean slate. Any day can be day one.
          </ThemedText>
        </>
      );
  }
}

export default function MonthRecapScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, "MonthRecap">>();
  const { theme } = useTheme();
  const { actions, dailyLogs, persona, subscription, aiConsent } = useApp();
  const { width } = useWindowDimensions();
  const [pageIndex, setPageIndex] = useState(0);
  const shotRefs = useRef<Map<number, ViewShot | null>>(new Map());

  const recap = useMemo(
    () =>
      buildMonthRecap(
        actions,
        dailyLogs,
        persona,
        route.params.monthKey,
        new Date(),
        subscription.isPremium ? 2 : 1,
      ),
    [
      actions,
      dailyLogs,
      persona,
      route.params.monthKey,
      subscription.isPremium,
    ],
  );
  const cards = useMemo(() => buildCards(), []);
  const [coachLine, setCoachLine] = useState(recap.closingLine);

  useEffect(() => {
    track("recap_viewed");
  }, []);

  useEffect(() => {
    setCoachLine(recap.closingLine);
    if (!aiConsent || !persona) return;

    let cancelled = false;
    const cacheKey = `${persona.id}|${recap.monthKey}`;
    void (async () => {
      try {
        const cached = await storage.getRecapCoachLine(cacheKey);
        if (cached) {
          if (!cancelled) setCoachLine(cached);
          return;
        }
        const line = await getRecapCoachLine({
          personaName: recap.personaName,
          monthLabel: recap.monthLabel,
          votesCast: recap.votesCast,
          consistency: recap.consistency,
          kickstartVotes: recap.kickstartVotes,
          healthVotes: recap.healthVotes,
          shieldsEarned: recap.shieldsEarned,
          shieldedDays: recap.shieldedDays,
          comebackGapDays: recap.comeback?.gapDays ?? null,
        });
        await storage.setRecapCoachLine(cacheKey, line);
        if (!cancelled) setCoachLine(line);
      } catch (error) {
        logger.warn("Using offline recap closing line:", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [aiConsent, persona, recap]);

  const displayRecap = useMemo(
    () => ({ ...recap, closingLine: coachLine }),
    [coachLine, recap],
  );

  const cardWidth = width - Spacing["3xl"] * 2;

  const handleShare = async () => {
    try {
      const shot = shotRefs.current.get(pageIndex);
      if (!shot?.capture) return;
      if (Platform.OS !== "web") Haptics.selectionAsync();
      const uri = await shot.capture();
      await Share.share(
        Platform.OS === "ios"
          ? { url: uri }
          : { message: "My month in votes — Resolution Companion", url: uri },
      );
      track("recap_shared");
    } catch (error) {
      logger.error("Failed to share recap card:", error);
    }
  };

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
        <ThemedText style={styles.title}>Month in Votes</ThemedText>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          pressRetentionOffset={16}
          accessibilityRole="button"
          accessibilityLabel="Close month recap"
          style={({ pressed }) => [
            styles.close,
            { opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Feather name="x" size={22} color={theme.text} />
        </Pressable>
      </View>

      <FlatList
        data={cards}
        keyExtractor={(item) => item.kind}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={cardWidth + Spacing.lg}
        contentContainerStyle={{ paddingHorizontal: Spacing["3xl"] }}
        onMomentumScrollEnd={(e) => {
          const index = Math.round(
            e.nativeEvent.contentOffset.x / (cardWidth + Spacing.lg),
          );
          setPageIndex(Math.min(Math.max(index, 0), cards.length - 1));
        }}
        renderItem={({ item, index }) => (
          <ViewShot
            ref={(ref) => {
              shotRefs.current.set(index, ref);
            }}
            options={{ format: "png", quality: 1 }}
            style={[styles.card, { width: cardWidth, marginRight: Spacing.lg }]}
          >
            <CardBody recap={displayRecap} kind={item.kind} />
            <View style={styles.brandRow}>
              <MaterialCommunityIcons
                name="compass-outline"
                size={14}
                color={theme.accent}
              />
              <ThemedText style={styles.brandText}>
                Resolution Companion
              </ThemedText>
            </View>
          </ViewShot>
        )}
      />

      <View style={styles.footer}>
        <View style={styles.dots}>
          {cards.map((card, i) => (
            <View
              key={card.kind}
              style={[
                styles.dot,
                {
                  backgroundColor:
                    i === pageIndex ? theme.accent : theme.backgroundTertiary,
                },
              ]}
            />
          ))}
        </View>
        <Pressable
          onPress={handleShare}
          hitSlop={8}
          pressRetentionOffset={12}
          accessibilityRole="button"
          accessibilityLabel="Share this card as an image"
          style={({ pressed }) => [
            styles.shareButton,
            {
              backgroundColor: theme.accent,
              opacity: pressed ? 0.8 : 1,
            },
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
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing["3xl"],
    marginBottom: Spacing.xl,
  },
  title: {
    ...Typography.title,
    flex: 1,
  },
  close: {
    padding: Spacing.xs,
  },
  card: {
    backgroundColor: "#0f0f1a",
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: "rgba(0, 217, 255, 0.3)",
    padding: Spacing["3xl"],
    justifyContent: "center",
    gap: Spacing.md,
  },
  cardEyebrow: {
    ...Typography.caption,
    color: "#A0A0A0",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    fontWeight: "600",
  },
  bigNumber: {
    fontSize: 72,
    fontWeight: "800",
    lineHeight: 78,
  },
  midNumber: {
    fontSize: 40,
    fontWeight: "800",
    lineHeight: 46,
  },
  cardIcon: {
    marginVertical: Spacing.sm,
  },
  cardHeadline: {
    ...Typography.title,
    color: "#FFFFFF",
  },
  cardSub: {
    ...Typography.body,
    color: "#A0A0A0",
    lineHeight: 22,
  },
  statPair: {
    flexDirection: "row",
    gap: Spacing["3xl"],
    marginVertical: Spacing.sm,
  },
  statBlock: {
    gap: Spacing.xs,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginTop: Spacing.lg,
  },
  brandText: {
    ...Typography.caption,
    color: "#A0A0A0",
  },
  footer: {
    paddingHorizontal: Spacing["3xl"],
    gap: Spacing.lg,
    marginTop: Spacing.xl,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  shareButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    height: Spacing.buttonHeight,
    borderRadius: BorderRadius.md,
  },
  shareText: {
    ...Typography.headline,
    color: "#0f0f1a",
  },
});
