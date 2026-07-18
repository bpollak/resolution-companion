import React, { useState, useEffect, useRef } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  Pressable,
  Platform,
  Alert,
  AppState,
  Linking,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";

import { useTheme } from "@/hooks/useTheme";
import { useApp } from "@/context/AppContext";
import { Colors, Spacing, Typography, BorderRadius } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { getApiUrl, getAuthHeaders } from "@/lib/query-client";
import { storage } from "@/lib/storage";
import { iapService, PRODUCT_IDS, IAPProduct, IAPPurchase } from "@/lib/iap";
import { logger } from "@/lib/logger";
import { track } from "@/lib/telemetry";

type PlanType = "monthly" | "yearly";

type SubscriptionRouteParams = {
  Subscription: { source?: "coach-limit" } | undefined;
};

// Fallback expiry estimate when the server didn't return a store-validated date
function estimateExpiryIso(plan: PlanType): string {
  const days = plan === "yearly" ? 365 : 30;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

// "about $2.08/mo" from the live yearly store price. Returns null when the
// store didn't provide a numeric amount or the runtime can't format the
// currency — callers must degrade gracefully rather than hardcode a price.
function formatMonthlyEquivalent(yearly: IAPProduct): string | null {
  if (!yearly.priceAmountMicros || !yearly.priceCurrencyCode) {
    return null;
  }
  const perMonth = yearly.priceAmountMicros / 1_000_000 / 12;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: yearly.priceCurrencyCode,
    }).format(perMonth);
  } catch {
    return null;
  }
}

// Savings of yearly vs. 12 months of monthly, from live store prices only.
function computeYearlySavingsPercent(
  monthly: IAPProduct | undefined,
  yearly: IAPProduct | undefined,
): number | null {
  if (!monthly?.priceAmountMicros || !yearly?.priceAmountMicros) {
    return null;
  }
  const fullYearAtMonthly = monthly.priceAmountMicros * 12;
  if (fullYearAtMonthly <= yearly.priceAmountMicros) {
    return null;
  }
  const percent = Math.round(
    (1 - yearly.priceAmountMicros / fullYearAtMonthly) * 100,
  );
  return percent >= 5 ? percent : null;
}

interface PlanCardProps {
  type: PlanType;
  price: string;
  period: string;
  subline?: string;
  badge?: string;
  selected: boolean;
  onSelect: () => void;
}

function PlanCard({
  type,
  price,
  period,
  subline,
  badge,
  selected,
  onSelect,
}: PlanCardProps) {
  const { theme, isDark } = useTheme();
  const title = type === "yearly" ? "Yearly" : "Monthly";

  return (
    <Pressable
      onPress={onSelect}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${title} plan, ${price} ${period}${
        subline ? `, ${subline}` : ""
      }${badge ? `, ${badge}` : ""}`}
      style={({ pressed }) => [
        styles.planCard,
        {
          backgroundColor: selected
            ? "rgba(0, 217, 255, 0.08)"
            : isDark
              ? Colors.dark.backgroundDefault
              : Colors.light.backgroundDefault,
          borderColor: selected ? Colors.dark.accent : "transparent",
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      {badge ? (
        <View
          style={[styles.planBadge, { backgroundColor: Colors.dark.accent }]}
        >
          <ThemedText style={styles.planBadgeText}>{badge}</ThemedText>
        </View>
      ) : null}
      <View style={styles.planHeader}>
        <View
          style={[
            styles.radioOuter,
            {
              borderColor: selected ? Colors.dark.accent : theme.textSecondary,
            },
          ]}
        >
          {selected ? (
            <View
              style={[
                styles.radioInner,
                { backgroundColor: Colors.dark.accent },
              ]}
            />
          ) : null}
        </View>
        <View style={styles.planInfo}>
          <ThemedText style={styles.planTitle}>{title}</ThemedText>
          {subline ? (
            <ThemedText
              style={[styles.planSubline, { color: theme.textSecondary }]}
            >
              {subline}
            </ThemedText>
          ) : null}
        </View>
        <View style={styles.planPriceCol}>
          <ThemedText style={styles.planPrice}>{price}</ThemedText>
          <ThemedText
            style={[styles.planPeriod, { color: theme.textSecondary }]}
          >
            {period}
          </ThemedText>
        </View>
      </View>
    </Pressable>
  );
}

interface CompareRowProps {
  title: string;
  description: string;
  /** Column value; null renders an "included" check mark. */
  free: string | null;
  premium: string | null;
  isLast?: boolean;
}

function CompareRow({
  title,
  description,
  free,
  premium,
  isLast = false,
}: CompareRowProps) {
  const { theme } = useTheme();

  return (
    <View
      accessible
      accessibilityLabel={`${title}: free plan ${free ?? "included"}, premium ${premium ?? "included"}`}
      style={[
        styles.compareRow,
        !isLast && {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: theme.border,
        },
      ]}
    >
      <View style={styles.compareFeatureCol}>
        <ThemedText style={styles.compareFeatureTitle}>{title}</ThemedText>
        <ThemedText
          style={[
            styles.compareFeatureDescription,
            { color: theme.textSecondary },
          ]}
        >
          {description}
        </ThemedText>
      </View>
      <View style={styles.compareValueCol}>
        {free === null ? (
          <Feather name="check" size={16} color={theme.textSecondary} />
        ) : (
          <ThemedText
            style={[styles.compareValue, { color: theme.textSecondary }]}
          >
            {free}
          </ThemedText>
        )}
      </View>
      <View style={styles.compareValueCol}>
        {premium === null ? (
          <Feather name="check" size={16} color={Colors.dark.accent} />
        ) : (
          <ThemedText
            style={[
              styles.compareValue,
              styles.compareValuePremium,
              { color: Colors.dark.accent },
            ]}
          >
            {premium}
          </ThemedText>
        )}
      </View>
    </View>
  );
}

export default function SubscriptionScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<SubscriptionRouteParams, "Subscription">>();
  // Presentation-only framing: arriving from the coach 10/10 gate explains
  // which cap was hit before the generic hero
  const fromCoachLimit = route.params?.source === "coach-limit";
  const { theme, isDark } = useTheme();
  const { subscription, refreshData } = useApp();
  const [selectedPlan, setSelectedPlan] = useState<PlanType>("yearly");
  const [isLoading, setIsLoading] = useState(false);
  const [iapProducts, setIapProducts] = useState<IAPProduct[]>([]);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [useNativeIAP, setUseNativeIAP] = useState(false);
  const [iapError, setIapError] = useState<string | null>(null);
  const [initializationComplete, setInitializationComplete] = useState(false);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    track("paywall_viewed");
    initializePurchases();
    checkSubscriptionStatus();
  }, []);

  const initializePurchases = async () => {
    setIapError(null);

    const timeoutPromise = new Promise<void>((resolve) => {
      setTimeout(() => {
        logger.log("IAP initialization timeout - using fallback");
        resolve();
      }, 15000);
    });

    const initPromise = async () => {
      try {
        const isAvailable = await iapService.isAvailable();

        if (!isAvailable) {
          logger.log("Native IAP not available on this device");
          return;
        }

        const products = await iapService.getProducts();

        if (products.length > 0) {
          logger.log("IAP products loaded:", products.length);
          setIapProducts(products);
          setUseNativeIAP(true);

          iapService.setPurchaseListener(
            async (purchase: IAPPurchase) => {
              try {
                const plan = iapService.getPlanFromProductId(
                  purchase.productId,
                );
                const newSubscription = {
                  isPremium: true,
                  plan: plan,
                  expiresAt: purchase.expirationDate || estimateExpiryIso(plan),
                  purchasedAt: new Date().toISOString(),
                };
                await storage.setSubscription(newSubscription);
                await refreshData();
                setIsLoading(false);
                track("paywall_purchase_success");
                Alert.alert(
                  "Success",
                  "Welcome to Premium! Your subscription is now active.",
                );
              } catch (err) {
                logger.error("Error processing purchase:", err);
                setIsLoading(false);
                Alert.alert(
                  "Purchase Issue",
                  "Your payment was processed but we had trouble activating your subscription. Please use Restore Purchases.",
                  [
                    { text: "OK", style: "default" },
                    {
                      text: "Restore",
                      onPress: () => handleRestorePurchases(),
                    },
                  ],
                );
              }
            },
            (error: Error) => {
              logger.error("Purchase error:", error);
              setIsLoading(false);

              const errorMessage =
                error.message || "There was a problem with your purchase.";
              if (
                errorMessage.includes("cancel") ||
                errorMessage.includes("USER_CANCELED")
              ) {
                return;
              }

              if (errorMessage.includes("PURCHASE_DEFERRED")) {
                Alert.alert(
                  "Approval Pending",
                  "Your purchase is awaiting approval (such as Ask to Buy). Once approved, your subscription will activate automatically.",
                );
                return;
              }

              Alert.alert(
                "Purchase Failed",
                `We couldn't complete your purchase. Please try again or contact support if the issue persists.\n\nDetails: ${errorMessage}`,
                [
                  { text: "OK", style: "default" },
                  { text: "Restore", onPress: () => handleRestorePurchases() },
                ],
              );
            },
          );
        } else {
          logger.log("No IAP products returned from store");
        }
      } catch (error) {
        logger.error("IAP initialization failed:", error);
      }
    };

    // Race between initialization and timeout
    await Promise.race([initPromise(), timeoutPromise]);

    setInitializationComplete(true);
  };

  useEffect(() => {
    const appStateSubscription = AppState.addEventListener(
      "change",
      (nextAppState) => {
        if (
          appState.current.match(/inactive|background/) &&
          nextAppState === "active"
        ) {
          checkSubscriptionStatus();
        }
        appState.current = nextAppState;
      },
    );

    return () => {
      appStateSubscription.remove();
    };
  }, []);

  const checkSubscriptionStatus = async () => {
    try {
      setCheckingStatus(true);
      const deviceId = await storage.getDeviceId();
      const response = await fetch(
        new URL(`/api/subscription/status/${deviceId}`, getApiUrl()).toString(),
        {
          headers: getAuthHeaders(),
        },
      );
      const data = await response.json();

      if (data.isPremium) {
        const newSubscription = {
          isPremium: true,
          plan: data.plan as "monthly" | "yearly",
          expiresAt: data.currentPeriodEnd,
          purchasedAt: new Date().toISOString(),
        };
        await storage.setSubscription(newSubscription);
        await refreshData();
      }
    } catch (error) {
      logger.error("Failed to check subscription status:", error);
    } finally {
      setCheckingStatus(false);
    }
  };

  const getIAPProductId = (plan: PlanType): string | null => {
    if (plan === "yearly") {
      return PRODUCT_IDS.YEARLY || null;
    }
    return PRODUCT_IDS.MONTHLY || null;
  };

  const handleSubscribe = async () => {
    if (!initializationComplete) {
      Alert.alert(
        "Please Wait",
        "Still loading purchase options. Please try again in a moment.",
      );
      return;
    }

    setIsLoading(true);
    setIapError(null);

    try {
      if (Platform.OS === "ios" && !useNativeIAP) {
        setIsLoading(false);
        Alert.alert(
          "Store Connection",
          "Unable to connect to the App Store. Please check your internet connection and try again.",
          [
            { text: "OK", style: "default" },
            {
              text: "Retry",
              onPress: () => {
                initializePurchases().then(() => handleSubscribe());
              },
            },
          ],
        );
        return;
      }

      const productId = getIAPProductId(selectedPlan);
      if (!productId) {
        setIsLoading(false);
        Alert.alert(
          "Product Unavailable",
          "This subscription option is temporarily unavailable. Please try again later.",
          [
            { text: "OK", style: "default" },
            { text: "Retry", onPress: () => initializePurchases() },
          ],
        );
        return;
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await iapService.purchaseProduct(productId);
    } catch (error: any) {
      logger.error("Purchase failed:", error);
      setIsLoading(false);

      const errorMessage = error?.message || "";
      if (
        errorMessage.includes("cancel") ||
        errorMessage.includes("USER_CANCELED")
      ) {
        return;
      }

      Alert.alert(
        "Purchase Error",
        `We couldn't complete your purchase. Please check your connection and try again.${errorMessage ? `\n\nDetails: ${errorMessage}` : ""}`,
        [
          { text: "OK", style: "default" },
          { text: "Retry", onPress: () => handleSubscribe() },
        ],
      );
    }
  };

  const handleRestorePurchases = async () => {
    if (Platform.OS === "web") {
      return;
    }

    setCheckingStatus(true);

    if (!useNativeIAP) {
      // Store connection isn't available — fall back to the server-side record
      await restoreFromServer();
      return;
    }

    try {
      const purchases = await iapService.restorePurchases();
      if (purchases.length > 0) {
        const latestPurchase = purchases[0];
        const plan = iapService.getPlanFromProductId(latestPurchase.productId);
        const newSubscription = {
          isPremium: true,
          plan: plan,
          expiresAt: latestPurchase.expirationDate || estimateExpiryIso(plan),
          purchasedAt: new Date(latestPurchase.purchaseTime).toISOString(),
        };
        await storage.setSubscription(newSubscription);
        await refreshData();
        track("paywall_restore_success");
        Alert.alert("Success", "Your subscription has been restored!");
        setCheckingStatus(false);
      } else {
        // Native IAP found no purchases — try the server-side DB record as a fallback
        // (covers reinstalls where the purchase was validated and stored previously)
        await restoreFromServer();
      }
    } catch (error) {
      logger.error("Native restore failed:", error);
      await restoreFromServer();
    }
  };

  const restoreFromServer = async () => {
    try {
      const deviceId = await storage.getDeviceId();
      const response = await fetch(
        new URL("/api/subscription/restore", getApiUrl()).toString(),
        {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({ deviceId }),
        },
      );

      if (!response.ok) {
        // Don't report "no purchases found" for auth/server failures
        logger.error("Restore endpoint error:", response.status);
        Alert.alert(
          "Error",
          "We couldn't check your subscription right now. Please try again later or contact support.",
        );
        return;
      }

      const data = await response.json();

      if (data.success && data.isPremium) {
        const newSubscription = {
          isPremium: true,
          plan: data.plan as "monthly" | "yearly",
          expiresAt: data.currentPeriodEnd,
          purchasedAt: new Date().toISOString(),
        };
        await storage.setSubscription(newSubscription);
        await refreshData();
        track("paywall_restore_success");
        Alert.alert("Success", "Your subscription has been restored!");
      } else {
        Alert.alert(
          "No Purchases Found",
          "We couldn't find an active subscription for this device. If you believe this is an error, please contact support.",
        );
      }
    } catch (error) {
      logger.error("Failed to restore subscription from server:", error);
      Alert.alert("Error", "Failed to restore subscription. Please try again.");
    } finally {
      setCheckingStatus(false);
    }
  };

  const monthlyProduct = iapProducts.find(
    (p) => p.productId === PRODUCT_IDS.MONTHLY,
  );
  const yearlyProduct = iapProducts.find(
    (p) => p.productId === PRODUCT_IDS.YEARLY,
  );
  // Only offer purchase once real store pricing has loaded — never show
  // placeholder prices on the paywall.
  const storeReady = useNativeIAP && !!monthlyProduct && !!yearlyProduct;
  const selectedProduct =
    selectedPlan === "yearly" ? yearlyProduct : monthlyProduct;

  // Derived, live-price-only marketing math (never hardcoded amounts)
  const savingsPercent = computeYearlySavingsPercent(
    monthlyProduct,
    yearlyProduct,
  );
  const yearlyPerMonth = yearlyProduct
    ? formatMonthlyEquivalent(yearlyProduct)
    : null;
  const yearlyBadge =
    savingsPercent !== null
      ? `BEST VALUE · SAVE ${savingsPercent}%`
      : "BEST VALUE";
  const yearlySubline = yearlyPerMonth
    ? `about ${yearlyPerMonth}/mo`
    : "12 months, one payment";

  if (subscription.isPremium) {
    const expiresAtDate = subscription.expiresAt
      ? new Date(subscription.expiresAt)
      : null;
    const isExpired = expiresAtDate
      ? expiresAtDate.getTime() < Date.now()
      : false;

    return (
      <View
        style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      >
        <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [
              styles.closeButton,
              { opacity: pressed ? 0.5 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Feather name="x" size={24} color={theme.text} />
          </Pressable>
          <ThemedText style={styles.headerTitle}>Premium</ThemedText>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.premiumActiveContainer}>
          <View
            style={[
              styles.premiumActiveIcon,
              { backgroundColor: Colors.dark.accent },
            ]}
          >
            <Feather name="check" size={48} color="#000000" />
          </View>
          <ThemedText style={styles.premiumActiveTitle}>
            You&apos;re Premium!
          </ThemedText>
          <ThemedText
            style={[
              styles.premiumActiveSubtitle,
              { color: theme.textSecondary },
            ]}
          >
            You have unlimited access to all features.
          </ThemedText>
          {expiresAtDate ? (
            <ThemedText
              style={[styles.expiresText, { color: theme.textSecondary }]}
            >
              {isExpired
                ? `Your subscription period ended on ${expiresAtDate.toLocaleDateString()}. Manage your subscription below to renew.`
                : `Your subscription renews on ${expiresAtDate.toLocaleDateString()}`}
            </ThemedText>
          ) : null}
          <Pressable
            onPress={() => {
              if (Platform.OS === "ios") {
                Linking.openURL("https://apps.apple.com/account/subscriptions");
              } else if (Platform.OS === "android") {
                Linking.openURL(
                  "https://play.google.com/store/account/subscriptions",
                );
              }
            }}
            accessibilityRole="button"
            accessibilityLabel="Manage subscription in store settings"
            style={({ pressed }) => [
              styles.manageButton,
              { opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <Feather name="settings" size={16} color={Colors.dark.accent} />
            <ThemedText
              style={[styles.manageButtonText, { color: Colors.dark.accent }]}
            >
              Manage Subscription
            </ThemedText>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.closeButton}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Feather name="x" size={24} color={theme.text} />
        </Pressable>
        <ThemedText style={styles.headerTitle}>Upgrade to Premium</ThemedText>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        delaysContentTouches={false}
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom: insets.bottom + (Platform.OS === "web" ? 140 : 260),
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {iapError ? (
          <View
            style={[
              styles.errorBanner,
              { backgroundColor: "rgba(255, 100, 100, 0.15)" },
            ]}
          >
            <Feather name="alert-circle" size={20} color="#FF6B6B" />
            <ThemedText style={[styles.errorText, { color: "#FF6B6B" }]}>
              {iapError}
            </ThemedText>
            <Pressable
              onPress={() => initializePurchases()}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Retry loading subscription options"
              style={({ pressed }) => [
                styles.retryButton,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <ThemedText
                style={[styles.retryButtonText, { color: Colors.dark.accent }]}
              >
                Retry
              </ThemedText>
            </Pressable>
          </View>
        ) : null}

        {fromCoachLimit ? (
          <View
            style={[
              styles.contextCard,
              {
                backgroundColor: isDark
                  ? Colors.dark.backgroundDefault
                  : Colors.light.backgroundDefault,
              },
            ]}
          >
            <Feather
              name="message-circle"
              size={20}
              color={Colors.dark.accent}
            />
            <ThemedText style={styles.contextCardText}>
              You&rsquo;ve used all 10 free check-ins this month &mdash; Premium
              removes the cap.
            </ThemedText>
          </View>
        ) : null}

        <View style={styles.heroSection}>
          <View
            style={[styles.heroIcon, { backgroundColor: Colors.dark.accent }]}
          >
            <Feather name="zap" size={32} color="#000000" />
          </View>
          <ThemedText style={styles.heroTitle}>
            Become who you&rsquo;re becoming &mdash; without limits
          </ThemedText>
          <ThemedText
            style={[styles.heroSubtitle, { color: theme.textSecondary }]}
          >
            Premium takes the caps off everything you use to grow.
          </ThemedText>
        </View>

        <View
          style={[
            styles.compareCard,
            {
              backgroundColor: isDark
                ? Colors.dark.backgroundDefault
                : Colors.light.backgroundDefault,
            },
          ]}
        >
          <View
            style={styles.compareHeaderRow}
            accessible
            accessibilityLabel="Comparison of the Free and Premium plans"
          >
            <View style={styles.compareFeatureCol} />
            <View style={styles.compareValueCol}>
              <ThemedText
                style={[styles.compareColLabel, { color: theme.textSecondary }]}
              >
                FREE
              </ThemedText>
            </View>
            <View style={styles.compareValueCol}>
              <ThemedText
                style={[styles.compareColLabel, { color: Colors.dark.accent }]}
              >
                PREMIUM
              </ThemedText>
            </View>
          </View>

          <CompareRow
            title="Personas"
            description={"Every identity you’re building, side by side"}
            free="1"
            premium="Unlimited"
          />
          <CompareRow
            title="AI coaching check-ins"
            description="Reflect with your coach as often as you need"
            free="10/mo"
            premium="Unlimited"
          />
          <CompareRow
            title="Milestones per persona"
            description="Add new milestones as your goals evolve"
            free="Starter set"
            premium="Unlimited"
          />
          <CompareRow
            title="Streak shields"
            description="Missed days bridged — extra grace, earned by consistency"
            free="1"
            premium="2"
          />
          <CompareRow
            title="Insights"
            description="When you show up, and the one thing to protect"
            free="—"
            premium="Included"
          />
          <CompareRow
            title="Daily action tracking"
            description="Log actions and build momentum every day"
            free={null}
            premium={null}
            isLast
          />
        </View>

        {Platform.OS === "web" ? (
          <View
            style={[
              styles.storeStateCard,
              {
                backgroundColor: isDark
                  ? Colors.dark.backgroundDefault
                  : Colors.light.backgroundDefault,
              },
            ]}
          >
            <Feather name="smartphone" size={24} color={Colors.dark.accent} />
            <ThemedText
              style={[styles.storeStateText, { color: theme.textSecondary }]}
            >
              Subscriptions are available in the Resolution Companion mobile
              app.
            </ThemedText>
          </View>
        ) : !initializationComplete ? (
          <View
            style={[
              styles.storeStateCard,
              {
                backgroundColor: isDark
                  ? Colors.dark.backgroundDefault
                  : Colors.light.backgroundDefault,
              },
            ]}
          >
            <ActivityIndicator size="small" color={Colors.dark.accent} />
            <ThemedText
              style={[styles.storeStateText, { color: theme.textSecondary }]}
            >
              Loading subscription options…
            </ThemedText>
          </View>
        ) : !storeReady ? (
          <View
            style={[
              styles.storeStateCard,
              {
                backgroundColor: isDark
                  ? Colors.dark.backgroundDefault
                  : Colors.light.backgroundDefault,
              },
            ]}
          >
            <Feather name="alert-circle" size={24} color={Colors.dark.error} />
            <ThemedText
              style={[styles.storeStateText, { color: theme.textSecondary }]}
            >
              We couldn&apos;t load subscription options from the store. Please
              check your connection and try again.
            </ThemedText>
            <Pressable
              onPress={() => initializePurchases()}
              accessibilityRole="button"
              accessibilityLabel="Retry loading subscription options"
              style={({ pressed }) => [
                styles.retryButton,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <ThemedText
                style={[styles.retryButtonText, { color: Colors.dark.accent }]}
              >
                Retry
              </ThemedText>
            </Pressable>
          </View>
        ) : (
          <View style={styles.plansSection}>
            <ThemedText style={styles.plansSectionTitle}>
              Choose your plan
            </ThemedText>
            <PlanCard
              type="yearly"
              price={yearlyProduct!.price}
              period="per year"
              subline={yearlySubline}
              badge={yearlyBadge}
              selected={selectedPlan === "yearly"}
              onSelect={() => setSelectedPlan("yearly")}
            />
            <PlanCard
              type="monthly"
              price={monthlyProduct!.price}
              period="per month"
              subline="Month to month"
              selected={selectedPlan === "monthly"}
              onSelect={() => setSelectedPlan("monthly")}
            />
            <ThemedText
              style={[styles.cancelHint, { color: theme.textSecondary }]}
            >
              Cancel anytime in{" "}
              {Platform.OS === "ios" ? "Settings" : "Google Play"} &mdash; you
              keep Premium until your period ends.
            </ThemedText>
          </View>
        )}
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            paddingBottom: insets.bottom + Spacing.lg,
            backgroundColor: theme.backgroundRoot,
          },
        ]}
      >
        {storeReady && selectedProduct ? (
          <ThemedText
            style={[
              styles.subscriptionDisclosure,
              { color: theme.textSecondary },
            ]}
          >
            {`Payment of ${selectedProduct.price} per ${selectedPlan === "yearly" ? "year" : "month"} will be charged to your ${Platform.OS === "ios" ? "Apple Account" : "Google Play account"} at confirmation of purchase. Subscription automatically renews unless canceled at least 24 hours before the end of the current period. `}
            You can manage and cancel your subscription in your device&apos;s{" "}
            {Platform.OS === "ios"
              ? "Settings > Subscriptions"
              : "Google Play > Subscriptions"}
            .
          </ThemedText>
        ) : null}

        {Platform.OS !== "web" ? (
          <Pressable
            onPress={handleSubscribe}
            disabled={isLoading || !storeReady}
            accessibilityRole="button"
            accessibilityLabel={
              storeReady && selectedProduct
                ? `Subscribe for ${selectedProduct.price} per ${selectedPlan === "yearly" ? "year" : "month"}`
                : "Subscribe"
            }
            accessibilityState={{ disabled: isLoading || !storeReady }}
            style={({ pressed }) => [
              styles.subscribeButton,
              { opacity: !storeReady ? 0.4 : pressed || isLoading ? 0.8 : 1 },
            ]}
          >
            <ThemedText style={styles.subscribeButtonText}>
              {isLoading
                ? "Processing..."
                : storeReady && selectedProduct
                  ? `Subscribe for ${selectedProduct.price}/${selectedPlan === "yearly" ? "year" : "month"}`
                  : "Subscribe"}
            </ThemedText>
          </Pressable>
        ) : null}

        <View style={styles.footerLinksRow}>
          {Platform.OS !== "web" ? (
            <>
              <Pressable
                onPress={handleRestorePurchases}
                disabled={checkingStatus}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Restore previous purchases"
                style={({ pressed }) => [
                  styles.footerLink,
                  { opacity: pressed ? 0.6 : 1 },
                ]}
              >
                <ThemedText
                  style={[
                    styles.footerLinkText,
                    { color: theme.textSecondary },
                  ]}
                >
                  {checkingStatus ? "Checking…" : "Restore Purchases"}
                </ThemedText>
              </Pressable>
              <ThemedText
                style={[
                  styles.footerLinkSeparator,
                  { color: theme.textSecondary },
                ]}
              >
                |
              </ThemedText>
            </>
          ) : null}
          <Pressable
            onPress={() =>
              WebBrowser.openBrowserAsync(
                new URL("/terms", getApiUrl()).toString(),
              )
            }
            hitSlop={8}
            accessibilityRole="link"
            accessibilityLabel="Terms of Use"
            style={({ pressed }) => [
              styles.footerLink,
              { opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <ThemedText
              style={[styles.footerLinkText, { color: theme.textSecondary }]}
            >
              Terms of Use
            </ThemedText>
          </Pressable>
          <ThemedText
            style={[styles.footerLinkSeparator, { color: theme.textSecondary }]}
          >
            |
          </ThemedText>
          <Pressable
            onPress={() =>
              WebBrowser.openBrowserAsync(
                new URL("/privacy", getApiUrl()).toString(),
              )
            }
            hitSlop={8}
            accessibilityRole="link"
            accessibilityLabel="Privacy Policy"
            style={({ pressed }) => [
              styles.footerLink,
              { opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <ThemedText
              style={[styles.footerLinkText, { color: theme.textSecondary }]}
            >
              Privacy Policy
            </ThemedText>
          </Pressable>
        </View>
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
  content: {
    paddingHorizontal: Spacing.lg,
  },
  contextCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: "rgba(0, 217, 255, 0.3)",
    marginBottom: Spacing.xl,
  },
  contextCardText: {
    ...Typography.small,
    flex: 1,
    lineHeight: 20,
  },
  heroSection: {
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  heroTitle: {
    ...Typography.h3,
    textAlign: "center",
    maxWidth: 320,
    marginBottom: Spacing.sm,
  },
  heroSubtitle: {
    ...Typography.small,
    textAlign: "center",
    maxWidth: 300,
  },
  compareCard: {
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  compareHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
  },
  compareColLabel: {
    ...Typography.caption,
    fontWeight: "700",
    letterSpacing: 0.5,
    fontSize: 11,
  },
  compareRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
  },
  compareFeatureCol: {
    flex: 1,
    paddingRight: Spacing.sm,
  },
  compareFeatureTitle: {
    ...Typography.small,
    fontWeight: "600",
    marginBottom: 2,
  },
  compareFeatureDescription: {
    ...Typography.caption,
    lineHeight: 17,
  },
  compareValueCol: {
    width: 74,
    alignItems: "center",
    justifyContent: "center",
  },
  compareValue: {
    ...Typography.caption,
    fontSize: 13,
    textAlign: "center",
  },
  compareValuePremium: {
    fontWeight: "700",
  },
  plansSection: {
    gap: Spacing.md,
    marginBottom: Spacing.xl,
  },
  plansSectionTitle: {
    ...Typography.headline,
    marginBottom: Spacing.xs,
  },
  storeStateCard: {
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.xl,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing["2xl"],
  },
  storeStateText: {
    ...Typography.body,
    textAlign: "center",
  },
  planCard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
  },
  planBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: Spacing.md,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    marginBottom: Spacing.md,
  },
  planBadgeText: {
    ...Typography.caption,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    color: "#000000",
  },
  planHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  radioOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  planInfo: {
    flex: 1,
    paddingRight: Spacing.sm,
  },
  planTitle: {
    ...Typography.headline,
    marginBottom: 2,
  },
  planSubline: {
    ...Typography.small,
  },
  planPriceCol: {
    alignItems: "flex-end",
  },
  planPrice: {
    ...Typography.h4,
  },
  planPeriod: {
    ...Typography.caption,
  },
  cancelHint: {
    ...Typography.caption,
    textAlign: "center",
    lineHeight: 17,
    paddingHorizontal: Spacing.md,
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  subscribeButton: {
    backgroundColor: Colors.dark.accent,
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    marginBottom: Spacing.sm,
  },
  subscribeButtonText: {
    ...Typography.headline,
    color: "#000000",
  },
  footerLinksRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
  },
  footerLink: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  footerLinkText: {
    ...Typography.caption,
    textDecorationLine: "underline",
  },
  footerLinkSeparator: {
    ...Typography.caption,
  },
  premiumActiveContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
  },
  premiumActiveIcon: {
    width: 100,
    height: 100,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.xl,
  },
  premiumActiveTitle: {
    ...Typography.title,
    marginBottom: Spacing.sm,
  },
  premiumActiveSubtitle: {
    ...Typography.body,
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  expiresText: {
    ...Typography.small,
  },
  manageButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    marginTop: Spacing.xl,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.dark.accent,
  },
  manageButtonText: {
    ...Typography.body,
    fontWeight: "600",
  },
  subscriptionDisclosure: {
    ...Typography.caption,
    textAlign: "center",
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    lineHeight: 17,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  errorText: {
    ...Typography.small,
    flex: 1,
  },
  retryButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  retryButtonText: {
    ...Typography.small,
    fontWeight: "600",
  },
});
