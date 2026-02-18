import React, { useState, useRef } from "react";
import {
  View,
  StyleSheet,
  TextInput,
  Pressable,
  FlatList,
  ActivityIndicator,
  Alert,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useTheme } from "@/hooks/useTheme";
import { useApp } from "@/context/AppContext";
import { Colors, Spacing, Typography, BorderRadius } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { ChatBubble } from "@/components/ChatBubble";
import { getOnboardingResponse, extractPersonaFromConversation, AIMessage } from "@/lib/ai";

const MIN_ACTIONS_PER_PERSONA = 3;
const MAX_ACTIONS_PER_PERSONA = 5;

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface IntroFeature {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  description: string;
  color: string;
}

const ACCENT_COLORS = {
  cyan: "#00D9FF",
  pink: "#FF6B9D",
  purple: "#9B6BFF",
  green: "#6BFFB8",
  orange: "#FFB86B",
};

interface IntroPage {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  subtitle: string;
  details?: { icon: keyof typeof Feather.glyphMap; text: string; color: string }[];
}

const INTRO_PAGES: IntroPage[] = [
  {
    icon: "compass",
    title: "Welcome to Resolution Companion",
    subtitle: "Build better habits and make real progress on your goals with personalized daily actions and AI-powered coaching.",
    details: [
      { icon: "target", text: "Daily habit tracking", color: ACCENT_COLORS.cyan },
      { icon: "message-circle", text: "AI coaching sessions", color: ACCENT_COLORS.pink },
      { icon: "trending-up", text: "Progress insights", color: ACCENT_COLORS.purple },
    ],
  },
  {
    icon: "message-circle",
    title: "Start with a Quick Chat",
    subtitle: "Answer a couple of questions about what you'd like to improve. We'll create a personalized plan just for you.",
    details: [
      { icon: "clock", text: "Takes about 2 minutes", color: ACCENT_COLORS.cyan },
      { icon: "shield", text: "Your answers stay private", color: ACCENT_COLORS.green },
    ],
  },
  {
    icon: "zap",
    title: "Free vs Premium",
    subtitle: "Get started for free, or unlock everything with Premium.",
    details: [
      { icon: "user", text: "Free: 1 persona, 10 check-ins/month", color: ACCENT_COLORS.cyan },
      { icon: "star", text: "Premium: Unlimited personas & coaching", color: ACCENT_COLORS.orange },
      { icon: "edit-2", text: "Both: Full customization of your plan", color: ACCENT_COLORS.green },
    ],
  },
];

const STEP_COLORS = [ACCENT_COLORS.cyan, ACCENT_COLORS.pink, ACCENT_COLORS.purple];

export default function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { theme, isDark } = useTheme();
  const { setHasOnboarded, setPersona, setBenchmarks, setActions } = useApp();

  const [introPage, setIntroPage] = useState(0);
  const [showIntro, setShowIntro] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [conversationComplete, setConversationComplete] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const messageCount = useRef(0);

  const handleBeginOnboarding = async () => {
    setShowIntro(false);
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    await startConversation();
  };

  const startConversation = async () => {
    setIsLoading(true);
    setIsStreaming(true);
    setStreamingText("");
    try {
      const response = await getOnboardingResponse([], (chunk) => {
        setStreamingText((prev) => prev + chunk);
      });

      setIsStreaming(false);
      const aiMessage: ChatMessage = {
        id: Date.now().toString(),
        role: "assistant",
        content: response,
      };
      setMessages([aiMessage]);
      setStreamingText("");
    } catch (error) {
      console.error("Failed to start conversation:", error);
      Alert.alert("Error", "Failed to connect to AI. Please try again.");
      setIsStreaming(false);
      setStreamingText("");
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!inputText.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: inputText.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText("");
    setIsLoading(true);
    setIsStreaming(true);
    setStreamingText("");
    messageCount.current += 1;

    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    try {
      const aiMessages: AIMessage[] = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      aiMessages.push({ role: "user", content: userMessage.content });

      const response = await getOnboardingResponse(aiMessages, (chunk) => {
        setStreamingText((prev) => prev + chunk);
      });

      setIsStreaming(false);
      const aiMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: response,
      };
      setMessages((prev) => [...prev, aiMessage]);
      setStreamingText("");

      if (messageCount.current >= 2) {
        setConversationComplete(true);
      }
    } catch (error) {
      console.error("Failed to send message:", error);
      Alert.alert("Error", "Failed to get AI response. Please try again.");
      setIsStreaming(false);
      setStreamingText("");
    } finally {
      setIsLoading(false);
    }
  };

  const finishOnboarding = async () => {
    setIsExtracting(true);
    try {
      const aiMessages: AIMessage[] = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const personaData = await extractPersonaFromConversation(aiMessages);

      let benchmarksToUse = personaData.benchmarks;
      if (benchmarksToUse.length < MIN_ACTIONS_PER_PERSONA) {
        const defaultBenchmarks = [
          {
            title: "Build Daily Momentum",
            elementalAction: {
              title: "Complete one action toward your goal",
              frequency: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
              kickstartVersion: "Spend 2 minutes planning your next step",
              anchorLink: "After I check my phone in the morning",
            },
          },
          {
            title: "Develop Mindfulness Practice",
            elementalAction: {
              title: "Practice mindful breathing",
              frequency: ["Monday", "Wednesday", "Friday"],
              kickstartVersion: "Take 3 deep breaths",
              anchorLink: "After I sit down at my desk",
            },
          },
          {
            title: "Maintain Physical Wellness",
            elementalAction: {
              title: "Move your body intentionally",
              frequency: ["Tuesday", "Thursday", "Saturday"],
              kickstartVersion: "Do 10 jumping jacks",
              anchorLink: "After I wake up",
            },
          },
        ];
        while (benchmarksToUse.length < MIN_ACTIONS_PER_PERSONA) {
          const nextDefault = defaultBenchmarks[benchmarksToUse.length];
          if (nextDefault) {
            benchmarksToUse.push(nextDefault);
          } else {
            break;
          }
        }
      }
      if (benchmarksToUse.length > MAX_ACTIONS_PER_PERSONA) {
        benchmarksToUse = benchmarksToUse.slice(0, MAX_ACTIONS_PER_PERSONA);
      }

      const persona = await setPersona({
        name: personaData.personaName,
        description: personaData.personaDescription,
      });

      const benchmarkPromises = benchmarksToUse.map(async (b) => {
        const benchmark = {
          id: Date.now().toString() + Math.random().toString(36).substr(2),
          personaId: persona.id,
          title: b.title,
          targetDate: null,
          status: "active" as const,
          createdAt: new Date().toISOString(),
        };
        return { benchmark, action: b.elementalAction };
      });

      const results = await Promise.all(benchmarkPromises);
      
      const allBenchmarks = results.map((r) => r.benchmark);
      const allActions = results.map((r, index) => ({
        id: Date.now().toString() + index + Math.random().toString(36).substr(2),
        benchmarkId: allBenchmarks[index].id,
        title: r.action.title,
        frequency: r.action.frequency,
        anchorLink: r.action.anchorLink,
        kickstartVersion: r.action.kickstartVersion,
        createdAt: new Date().toISOString(),
      }));

      await setBenchmarks(allBenchmarks);
      await setActions(allActions);
      await setHasOnboarded(true);

      if (Platform.OS !== "web") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      navigation.reset({
        index: 0,
        routes: [{
          name: "Main",
          state: {
            routes: [{ name: "ProgressTab" }],
          },
        }],
      });
    } catch (error) {
      console.error("Failed to extract persona:", error);
      Alert.alert("Error", "Failed to create your persona. Please try again.");
    } finally {
      setIsExtracting(false);
    }
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => (
    <ChatBubble message={item.content} isUser={item.role === "user"} />
  );

  const handleNextPage = () => {
    if (introPage < INTRO_PAGES.length - 1) {
      setIntroPage(introPage + 1);
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    }
  };

  const handlePrevPage = () => {
    if (introPage > 0) {
      setIntroPage(introPage - 1);
      if (Platform.OS !== "web") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    }
  };

  const currentIntroPage = INTRO_PAGES[introPage];
  const isLastIntroPage = introPage === INTRO_PAGES.length - 1;

  if (showIntro) {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
        <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
          {navigation.canGoBack() ? (
            <Pressable
              onPress={() => navigation.goBack()}
              style={styles.closeButton}
            >
              <Feather name="x" size={24} color={theme.text} />
            </Pressable>
          ) : (
            <View style={styles.headerSpacer} />
          )}
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.introPageContent}>
          <View style={styles.introHero}>
            <View style={styles.heroLogoContainer}>
              <View style={[styles.heroGlowRing, { borderColor: STEP_COLORS[introPage] + "40" }]} />
              <View style={styles.heroLogoInner}>
                <View style={[styles.heroLogoCore, { backgroundColor: STEP_COLORS[introPage] + "30" }]}>
                  <Feather name={currentIntroPage.icon} size={40} color={STEP_COLORS[introPage]} />
                </View>
              </View>
            </View>
            <ThemedText style={styles.introTitle}>{currentIntroPage.title}</ThemedText>
            <ThemedText style={[styles.introSubtitle, { color: theme.textSecondary }]}>
              {currentIntroPage.subtitle}
            </ThemedText>
          </View>

          {currentIntroPage.details ? (
            <View style={styles.introDetailsContainer}>
              {currentIntroPage.details.map((detail, index) => (
                <View
                  key={index}
                  style={[
                    styles.introDetailRow,
                    { backgroundColor: isDark ? Colors.dark.backgroundDefault : Colors.light.backgroundDefault },
                  ]}
                >
                  <View style={[styles.introDetailIcon, { backgroundColor: detail.color + "20" }]}>
                    <Feather name={detail.icon} size={18} color={detail.color} />
                  </View>
                  <ThemedText style={styles.introDetailText}>{detail.text}</ThemedText>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        <View style={[styles.introFooter, { paddingBottom: Math.max(insets.bottom, 20) + Spacing.xl, backgroundColor: theme.backgroundRoot }]}>
          <View style={styles.paginationDots}>
            {INTRO_PAGES.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.paginationDot,
                  {
                    backgroundColor: index === introPage ? STEP_COLORS[introPage] : theme.backgroundTertiary,
                    width: index === introPage ? 24 : 8,
                  },
                ]}
              />
            ))}
          </View>

          <View style={styles.introButtonRow}>
            {introPage > 0 ? (
              <Pressable
                onPress={handlePrevPage}
                style={({ pressed }) => [
                  styles.backButton,
                  { backgroundColor: isDark ? Colors.dark.backgroundDefault : Colors.light.backgroundDefault, opacity: pressed ? 0.8 : 1 },
                ]}
              >
                <Feather name="arrow-left" size={20} color={theme.text} />
              </Pressable>
            ) : null}
            <Pressable
              onPress={isLastIntroPage ? handleBeginOnboarding : handleNextPage}
              style={({ pressed }) => [
                styles.beginButton,
                { flex: 1, opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <ThemedText style={styles.beginButtonText}>
                {isLastIntroPage ? "Let's Get Started" : "Continue"}
              </ThemedText>
              <Feather name="arrow-right" size={20} color="#000000" />
            </Pressable>
          </View>

          {isLastIntroPage ? (
            <ThemedText style={[styles.introFooterNote, { color: theme.textSecondary }]}>
              Takes about 2 minutes
            </ThemedText>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.closeButton}
        >
          <Feather name="x" size={24} color={theme.text} />
        </Pressable>
        <ThemedText style={styles.headerTitle}>Create Your Plan</ThemedText>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.progressBarContainer}>
        <View style={styles.progressSteps}>
          <View style={[styles.progressStep, { backgroundColor: Colors.dark.accent }]} />
          <View style={[styles.progressStep, { backgroundColor: messageCount.current >= 1 ? Colors.dark.accent : theme.backgroundTertiary }]} />
          <View style={[styles.progressStep, { backgroundColor: conversationComplete ? Colors.dark.accent : theme.backgroundTertiary }]} />
        </View>
        <ThemedText style={[styles.progressStepLabel, { color: theme.textSecondary }]}>
          {conversationComplete 
            ? "Ready to create your persona" 
            : messageCount.current >= 1 
              ? "Step 2 of 2: Tell us more" 
              : "Step 1 of 2: Share your vision"}
        </ThemedText>
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
        keyboardShouldPersistTaps="handled"
        ListFooterComponent={
          isStreaming && streamingText ? (
            <ChatBubble message={streamingText} isUser={false} />
          ) : isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={Colors.dark.accent} />
            </View>
          ) : null
        }
      />

      {conversationComplete && !isExtracting ? (
        <View style={[styles.finishContainer, { paddingBottom: insets.bottom + Spacing.lg }]}>
          <View style={styles.progressIndicator}>
            <Feather name="check-circle" size={16} color={Colors.dark.success} />
            <ThemedText style={[styles.progressText, { color: theme.textSecondary }]}>
              Ready to create your persona
            </ThemedText>
          </View>
          <Pressable
            onPress={finishOnboarding}
            style={({ pressed }) => [
              styles.finishButton,
              { opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <ThemedText style={styles.finishButtonText}>
              Create My Persona
            </ThemedText>
            <Feather name="arrow-right" size={20} color="#000000" />
          </Pressable>
        </View>
      ) : null}

      {isExtracting ? (
        <View style={[styles.extractingContainer, { paddingBottom: insets.bottom + Spacing.lg }]}>
          <ActivityIndicator size="large" color={Colors.dark.accent} />
          <ThemedText style={[styles.extractingText, { color: theme.textSecondary }]}>
            Creating your personalized evolution plan...
          </ThemedText>
        </View>
      ) : null}

      {!conversationComplete && !isExtracting ? (
        <View
          style={[
            styles.inputContainer,
            {
              paddingBottom: insets.bottom + Spacing.md,
              backgroundColor: isDark
                ? Colors.dark.backgroundDefault
                : Colors.light.backgroundDefault,
            },
          ]}
        >
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: isDark
                  ? Colors.dark.backgroundSecondary
                  : Colors.light.backgroundSecondary,
                color: theme.text,
              },
            ]}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Share your aspirations..."
            placeholderTextColor={theme.textSecondary}
            multiline
            maxLength={500}
            editable={!isLoading}
          />
          <Pressable
            onPress={sendMessage}
            disabled={!inputText.trim() || isLoading}
            style={({ pressed }) => [
              styles.sendButton,
              {
                backgroundColor:
                  inputText.trim() && !isLoading
                    ? Colors.dark.accent
                    : isDark
                      ? Colors.dark.backgroundTertiary
                      : Colors.light.backgroundTertiary,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color={theme.text} />
            ) : (
              <Feather
                name="send"
                size={20}
                color={inputText.trim() ? "#000000" : theme.textSecondary}
              />
            )}
          </Pressable>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  closeButton: {
    padding: Spacing.sm,
  },
  headerTitle: {
    ...Typography.headline,
    flex: 1,
    textAlign: "center",
  },
  headerSpacer: {
    width: 40,
  },
  progressBarContainer: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    alignItems: "center",
  },
  progressSteps: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  progressStep: {
    width: 60,
    height: 4,
    borderRadius: 2,
  },
  progressStepLabel: {
    ...Typography.small,
  },
  messageList: {
    paddingVertical: Spacing.lg,
    flexGrow: 1,
  },
  loadingContainer: {
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    alignItems: "flex-start",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    gap: Spacing.sm,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    ...Typography.body,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  finishContainer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  progressIndicator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  progressText: {
    ...Typography.small,
    fontWeight: "500",
  },
  finishButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.accent,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.full,
    gap: Spacing.sm,
  },
  finishButtonText: {
    ...Typography.headline,
    color: "#000000",
  },
  extractingContainer: {
    alignItems: "center",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    gap: Spacing.md,
  },
  extractingText: {
    ...Typography.body,
    textAlign: "center",
  },
  introContent: {
    paddingHorizontal: Spacing.lg,
  },
  introHero: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
  },
  heroLogoContainer: {
    width: 100,
    height: 100,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.xl,
  },
  heroGlowRing: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
  },
  heroLogoInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(0, 217, 255, 0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroLogoCore: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(0, 217, 255, 0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroOrbit1: {
    position: "absolute",
    top: -4,
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  heroOrbit2: {
    position: "absolute",
    right: -4,
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  heroOrbit3: {
    position: "absolute",
    bottom: -4,
    left: 20,
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  introTitle: {
    ...Typography.title,
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  introSubtitle: {
    ...Typography.body,
    textAlign: "center",
    lineHeight: 24,
  },
  introSection: {
    marginTop: Spacing.xl,
  },
  introSectionTitle: {
    ...Typography.headline,
    marginBottom: Spacing.md,
  },
  introCard: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
  },
  introStep: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  introStepNumber: {
    width: 28,
    height: 28,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  introStepNumberText: {
    ...Typography.body,
    fontWeight: "700",
    color: "#000000",
  },
  introStepContent: {
    flex: 1,
  },
  introStepTitle: {
    ...Typography.body,
    fontWeight: "600",
    marginBottom: 4,
  },
  introStepDesc: {
    ...Typography.small,
    lineHeight: 20,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    ...Typography.body,
    fontWeight: "600",
    marginBottom: 2,
  },
  featureDesc: {
    ...Typography.small,
    lineHeight: 18,
  },
  introFooter: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  beginButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dark.accent,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.full,
    gap: Spacing.sm,
  },
  beginButtonText: {
    ...Typography.headline,
    color: "#000000",
  },
  introFooterNote: {
    ...Typography.caption,
    textAlign: "center",
    marginTop: Spacing.sm,
  },
  introPageContent: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: Spacing.lg,
  },
  introDetailsContainer: {
    marginTop: Spacing.xl,
    gap: Spacing.sm,
  },
  introDetailRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
  },
  introDetailIcon: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  introDetailText: {
    ...Typography.body,
    flex: 1,
  },
  paginationDots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  paginationDot: {
    height: 8,
    borderRadius: 4,
  },
  introButtonRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  backButton: {
    width: 52,
    height: 52,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
  },
});
