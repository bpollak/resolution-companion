import React, { useState, useEffect, useRef } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  Pressable,
  Platform,
  Alert,
  AppState,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
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

type PlanType = "monthly" | "yearly";

interface PlanCardProps {
  type: PlanType;
  price: string;
  period: string;
  savings?: string;
  selected: boolean;
  onSelect: () => void;
}

function PlanCard({
  type,
  price,
  period,
  savings,
  selected,
  onSelect,
}: PlanCardProps) {
  const { theme, isDark } = useTheme();

  return (
    <Pressable
      onPress={onSelect}
      style={({ pressed }) => [
        styles.planCard,
        {
          backgroundColor: isDark
            ? Colors.dark.backgroundDefault
            : Colors.light.backgroundDefault,
          borderColor: selected ? Colors.dark.accent : "transparent",
          borderWidth: 2,
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
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
          <ThemedText style={styles.planPrice}>{price}</ThemedText>
          <ThemedText
            style={[styles.planPeriod, { color: theme.textSecondary }]}
          >
            {period}
          </ThemedText>
        </View>
      </View>
      {savings ? (
        <View
          style={[
            styles.savingsBadge,
            { backgroundColor: "rgba(0, 217, 255, 0.15)" },
          ]}
        >
          <ThemedText
            style={[styles.savingsText, { color: Colors.dark.accent }]}
          >
            {savings}
          </ThemedText>
        </View>
      ) : null}
    </Pressable>
  );
}

interface FeatureRowProps {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  description: string;
  isPremium?: boolean;
}

function FeatureRow({
  icon,
  title,
  description,
  isPremium = false,
}: FeatureRowProps) {
  const { theme } = useTheme();

  return (
    <View style={styles.featureRow}>
      <View
        style={[
          styles.featureIcon,
          {
            backgroundColor: isPremium
              ? "rgba(0, 217, 255, 0.1)"
              : "rgba(255,255,255,0.05)",
          },
        ]}
      >
        <Feather
          name={icon}
          size={18}
          color={isPremium ? Colors.dark.accent : theme.textSecondary}
        />
      </View>
      <View style={styles.featureContent}>
        <ThemedText style={styles.featureTitle}>{title}</ThemedText>
        <ThemedText
          style={[styles.featureDescription, { color: theme.textSecondary }]}
        >
          {description}
        </ThemedText>
      </View>
      {isPremium ? (
        <View
          style={[styles.premiumBadge, { backgroundColor: Colors.dark.accent }]}
        >
          <ThemedText style={styles.premiumBadgeText}>PRO</ThemedText>
        </View>
      ) : null}
    </View>
  );
}

export default function SubscriptionScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { theme, isDark } = useTheme();
  const { subscription, refreshData } = useApp();
  const [selectedPlan, setSelectedPlan] = useState<PlanType>("yearly");
  const [isLoading, setIsLoading] = useState(false);
  const [iapProducts, setIapProducts] = useState<IAPProduct[]>([]);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [useNativeIAP, setUseNativeIAP] = useState(false);
  const [iapError, setIapError] = useState<string | null>(null);
  const [initializationComplete, setInitializationComplete] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const appState = useRef(AppState.currentState);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    initializePurchases();
    checkSubscriptionStatus();
    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const initializePurchases = async () => {
    if (!mountedRef.current) return;
    setIapError(null);

    // Bound the whole init — but on timeout we surface an error, we don't
    // silently pretend init succeeded. Hardcoded paywall prices used to
    // sneak in via the old "resolve on timeout" path.
    const withTimeout = <T,>(p: Promise<T>, ms: number, label: string) =>
      Promise.race<T>([
        p,
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error(`${label} timed out`)), ms),
        ),
      ]);

    try {
      const isAvailable = await iapService.isAvailable();
      if (!isAvailable) {
        if (mountedRef.current) {
          setIapError("In-app purchases are not available on this device.");
          setInitializationComplete(true);
        }
        return;
      }

      const products = await withTimeout(
        iapService.getProducts(),
        12000,
        "Store lookup",
      );

      if (!mountedRef.current) return;

      if (products.length === 0) {
        setIapError(
          "We couldn't load subscription options from the store. Pull to retry.",
        );
        setInitializationComplete(true);
        return;
      }

      setIapProducts(products);
      setUseNativeIAP(true);

      iapService.setPurchaseListener(
        async (purchase: IAPPurchase) => {
          try {
            // Ask the server to validate the receipt and return the real
            // expiration date from Apple/Google. Never trust a client clock
            // for billing state.
            const validated = await validateAndStoreSubscription(purchase);
            if (!mountedRef.current) return;
            setIsLoading(false);
            if (validated) {
              await refreshData();
              Alert.alert(
                "Success",
                "Welcome to Premium! Your subscription is now active.",
              );
            } else {
              Alert.alert(
                "Purchase Issue",
                "Your payment was processed but we couldn't activate your subscription. Please tap Restore Purchases.",
                [
                  { text: "OK", style: "default" },
                  { text: "Restore", onPress: () => handleRestorePurchases() },
                ],
              );
            }
          } catch (err) {
            logger.error("Error processing purchase:", err);
            if (!mountedRef.current) return;
            setIsLoading(false);
            Alert.alert(
              "Purchase Issue",
              "Your payment was processed but activation failed. Please use Restore Purchases.",
            );
          }
        },
        (error: Error) => {
          logger.error("Purchase error:", error);
          if (!mountedRef.current) return;
          setIsLoading(false);
          const msg = error.message || "";
          if (msg.includes("cancel") || msg.includes("USER_CANCELED")) return;
          Alert.alert(
            "Purchase Failed",
            "We couldn't complete your purchase. Please try again or use Restore Purchases if you've already paid.",
            [
              { text: "OK", style: "default" },
              { text: "Restore", onPress: () => handleRestorePurchases() },
            ],
          );
        },
      );
    } catch (error) {
      logger.error("IAP initialization failed:", error);
      if (mountedRef.current) {
        setIapError(
          "We couldn't reach the store. Please check your connection and retry.",
        );
      }
    } finally {
      if (mountedRef.current) setInitializationComplete(true);
    }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkSubscriptionStatus = async () => {
    try {
      setCheckingStatus(true);
      const deviceId = await storage.getDeviceId();
      const response = await fetch(
        new URL(
          `/api/subscription/status/${encodeURIComponent(deviceId)}`,
          getApiUrl(),
        ).toString(),
        { headers: getAuthHeaders() },
      );

      if (!response.ok) {
        logger.error("Subscription status fetch failed:", response.status);
        return;
      }

      const data = await response.json();
      if (!mountedRef.current) return;

      if (data.isPremium && data.currentPeriodEnd) {
        const prior = await storage.getSubscription();
        await storage.setSubscription({
          isPremium: true,
          plan: data.plan as "monthly" | "yearly",
          expiresAt: data.currentPeriodEnd,
          purchasedAt: prior.purchasedAt || new Date().toISOString(),
        });
        await refreshData();
      } else if (!data.isPremium) {
        // Server says sub lapsed — reflect that locally.
        const prior = await storage.getSubscription();
        if (prior.isPremium) {
          await storage.setSubscription({
            isPremium: false,
            plan: "free",
            expiresAt: null,
            purchasedAt: null,
          });
          await refreshData();
        }
      }
    } catch (error) {
      logger.error("Failed to check subscription status:", error);
    } finally {
      if (mountedRef.current) setCheckingStatus(false);
    }
  };

  const validateAndStoreSubscription = async (
    purchase: IAPPurchase,
  ): Promise<boolean> => {
    const deviceId = await storage.getDeviceId();
    const response = await fetch(
      new URL("/api/iap/validate", getApiUrl()).toString(),
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          deviceId,
          platform: Platform.OS,
          productId: purchase.productId,
          transactionId: purchase.transactionId,
          receipt: purchase.transactionReceipt,
          purchaseTime: purchase.purchaseTime,
        }),
      },
    );

    if (!response.ok) {
      logger.error("IAP validation failed:", response.status);
      return false;
    }

    const data = await response.json();
    if (!data.valid || !data.expirationDate) return false;

    await storage.setSubscription({
      isPremium: true,
      plan: data.plan,
      expiresAt: data.expirationDate,
      purchasedAt: new Date(purchase.purchaseTime).toISOString(),
    });
    return true;
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

    if (!useNativeIAP || iapProducts.length === 0) {
      Alert.alert(
        "Store Unavailable",
        "We couldn't reach the store to load pricing. Please check your connection and retry.",
        [
          { text: "OK", style: "default" },
          { text: "Retry", onPress: () => initializePurchases() },
        ],
      );
      return;
    }

    const productId = getIAPProductId(selectedPlan);
    const product = iapProducts.find((p) => p.productId === productId);
    if (!productId || !product) {
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

    setIsLoading(true);
    setIapError(null);

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await iapService.purchaseProduct(productId);
    } catch (error: any) {
      logger.error("Purchase failed:", error);
      if (mountedRef.current) setIsLoading(false);

      const errorMessage = error?.message || "";
      if (
        errorMessage.includes("cancel") ||
        errorMessage.includes("USER_CANCELED")
      ) {
        return;
      }

      Alert.alert(
        "Purchase Error",
        "We couldn't complete your purchase. Please check your connection and try again.",
        [
          { text: "OK", style: "default" },
          { text: "Retry", onPress: () => handleSubscribe() },
        ],
      );
    }
  };

  const handleRestorePurchases = async () => {
    if (isRestoring) return;
    setIsRestoring(true);

    try {
      if (useNativeIAP && Platform.OS !== "web") {
        try {
          const purchases = await iapService.restorePurchases();
          if (purchases.length > 0) {
            // Validate the latest purchase server-side so we write the real
            // expiration date rather than guessing from a client clock.
            const latest = purchases.sort(
              (a, b) => b.purchaseTime - a.purchaseTime,
            )[0];
            const ok = await validateAndStoreSubscription(latest);
            if (ok) {
              await refreshData();
              Alert.alert("Success", "Your subscription has been restored!");
              return;
            }
          }
        } catch (error) {
          logger.error("Native restore failed:", error);
        }
      }

      // Fall back to the server record (reinstall case): the server re-checks
      // with Apple/Google itself before returning success.
      await restoreFromServer();
    } finally {
      if (mountedRef.current) setIsRestoring(false);
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
        logger.error("Restore request failed:", response.status);
        Alert.alert(
          "Error",
          "We couldn't reach the server to restore your subscription. Please try again.",
        );
        return;
      }

      const data = await response.json();

      if (data.success && data.isPremium && data.currentPeriodEnd) {
        const prior = await storage.getSubscription();
        await storage.setSubscription({
          isPremium: true,
          plan: data.plan as "monthly" | "yearly",
          expiresAt: data.currentPeriodEnd,
          purchasedAt: prior.purchasedAt || new Date().toISOString(),
        });
        await refreshData();
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
    }
  };

  if (subscription.isPremium) {
    const manageUrl =
      Platform.OS === "android"
        ? "https://play.google.com/store/account/subscriptions"
        : "https://apps.apple.com/account/subscriptions";
    return (
      <View
        style={[styles.container, { backgroundColor: theme.backgroundRoot }]}
      >
        <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={styles.closeButton}
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
            You're Premium!
          </ThemedText>
          <ThemedText
            style={[
              styles.premiumActiveSubtitle,
              { color: theme.textSecondary },
            ]}
          >
            You have unlimited access to all features.
          </ThemedText>
          {subscription.expiresAt ? (
            <ThemedText
              style={[styles.expiresText, { color: theme.textSecondary }]}
            >
              Your subscription renews on{" "}
              {new Date(subscription.expiresAt).toLocaleDateString()}
            </ThemedText>
          ) : null}
          <Pressable
            onPress={() => WebBrowser.openBrowserAsync(manageUrl)}
            accessibilityRole="button"
            accessibilityLabel="Manage subscription"
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

  const yearlyProduct = iapProducts.find(
    (p) => p.productId === PRODUCT_IDS.YEARLY,
  );
  const monthlyProduct = iapProducts.find(
    (p) => p.productId === PRODUCT_IDS.MONTHLY,
  );
  const selectedProduct =
    selectedPlan === "yearly" ? yearlyProduct : monthlyProduct;
  const canPurchase =
    initializationComplete &&
    useNativeIAP &&
    iapProducts.length > 0 &&
    !!selectedProduct;

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.closeButton}
        >
          <Feather name="x" size={24} color={theme.text} />
        </Pressable>
        <ThemedText style={styles.headerTitle}>Upgrade to Premium</ThemedText>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 120 },
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
              style={styles.retryButton}
            >
              <ThemedText
                style={[styles.retryButtonText, { color: Colors.dark.accent }]}
              >
                Retry
              </ThemedText>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.heroSection}>
          <View
            style={[styles.heroIcon, { backgroundColor: Colors.dark.accent }]}
          >
            <Feather name="zap" size={32} color="#000000" />
          </View>
          <ThemedText style={styles.heroTitle}>
            Unlock Your Full Potential
          </ThemedText>
          <ThemedText
            style={[styles.heroSubtitle, { color: theme.textSecondary }]}
          >
            Get unlimited access to all premium features and accelerate your
            personal evolution.
          </ThemedText>
        </View>

        <View style={styles.plansSection}>
          {yearlyProduct ? (
            <PlanCard
              type="yearly"
              price={yearlyProduct.price}
              period="per year"
              savings="Save 30%"
              selected={selectedPlan === "yearly"}
              onSelect={() => setSelectedPlan("yearly")}
            />
          ) : !initializationComplete ? (
            <View style={styles.planLoadingCard}>
              <ActivityIndicator size="small" color={Colors.dark.accent} />
              <ThemedText
                style={[styles.planLoadingText, { color: theme.textSecondary }]}
              >
                Loading yearly plan…
              </ThemedText>
            </View>
          ) : null}
          {monthlyProduct ? (
            <PlanCard
              type="monthly"
              price={monthlyProduct.price}
              period="per month"
              selected={selectedPlan === "monthly"}
              onSelect={() => setSelectedPlan("monthly")}
            />
          ) : !initializationComplete ? (
            <View style={styles.planLoadingCard}>
              <ActivityIndicator size="small" color={Colors.dark.accent} />
              <ThemedText
                style={[styles.planLoadingText, { color: theme.textSecondary }]}
              >
                Loading monthly plan…
              </ThemedText>
            </View>
          ) : null}
        </View>

        <View style={styles.featuresSection}>
          <ThemedText style={styles.featuresSectionTitle}>
            Premium Features
          </ThemedText>

          <FeatureRow
            icon="users"
            title="Unlimited Personas"
            description="Create as many personas as you need for different areas of your life"
            isPremium
          />
          <FeatureRow
            icon="message-circle"
            title="Unlimited Coaching"
            description="Get AI-powered coaching whenever you need guidance"
            isPremium
          />
          <FeatureRow
            icon="plus-circle"
            title="Custom Actions"
            description="Add your own actions to benchmarks beyond AI suggestions"
            isPremium
          />
          <FeatureRow
            icon="bar-chart-2"
            title="Advanced Insights"
            description="Deeper analytics on your progress and patterns"
            isPremium
          />
        </View>

        <View style={styles.freeFeatures}>
          <ThemedText
            style={[styles.freeFeaturesTitle, { color: theme.textSecondary }]}
          >
            Free Plan Includes
          </ThemedText>
          <FeatureRow
            icon="user"
            title="1 Persona"
            description="Start with one Target Persona to focus your growth"
          />
          <FeatureRow
            icon="calendar"
            title="Daily Tracking"
            description="Track your actions and build momentum chains"
          />
          <FeatureRow
            icon="message-square"
            title="10 Check-ins/Month"
            description="Monthly AI coaching check-ins to stay on track"
          />
        </View>
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
        {selectedProduct ? (
          <ThemedText
            style={[
              styles.subscriptionDisclosure,
              { color: theme.textSecondary },
            ]}
          >
            {selectedPlan === "yearly"
              ? `Annual subscription — ${selectedProduct.price} per year, billed once per year. `
              : `Monthly subscription — ${selectedProduct.price} per month, billed monthly. `}
            Payment is charged to your{" "}
            {Platform.OS === "android" ? "Google Play" : "Apple ID"} account at
            confirmation of purchase. The subscription renews automatically at
            the same price unless auto-renewal is turned off at least 24 hours
            before the end of the current period. Manage or cancel any time in{" "}
            {Platform.OS === "android"
              ? "Play Store > Payments & subscriptions > Subscriptions."
              : "Settings > [your name] > Subscriptions."}
          </ThemedText>
        ) : (
          <ThemedText
            style={[
              styles.subscriptionDisclosure,
              { color: theme.textSecondary },
            ]}
          >
            Subscription pricing and terms will appear here once the store
            connection loads.
          </ThemedText>
        )}

        <View style={styles.legalLinks}>
          <Pressable
            onPress={() => WebBrowser.openBrowserAsync(`${getApiUrl()}terms`)}
            style={styles.legalLink}
            accessibilityRole="link"
            accessibilityLabel="Open Terms of Use"
          >
            <ThemedText
              style={[styles.legalLinkText, { color: theme.textSecondary }]}
            >
              Terms of Use (EULA)
            </ThemedText>
          </Pressable>
          <ThemedText
            style={[styles.legalSeparator, { color: theme.textSecondary }]}
          >
            |
          </ThemedText>
          <Pressable
            onPress={() => WebBrowser.openBrowserAsync(`${getApiUrl()}privacy`)}
            style={styles.legalLink}
            accessibilityRole="link"
            accessibilityLabel="Open Privacy Policy"
          >
            <ThemedText
              style={[styles.legalLinkText, { color: theme.textSecondary }]}
            >
              Privacy Policy
            </ThemedText>
          </Pressable>
        </View>

        <Pressable
          onPress={handleSubscribe}
          disabled={isLoading || !canPurchase}
          accessibilityRole="button"
          accessibilityLabel={
            selectedProduct
              ? `Subscribe for ${selectedProduct.price} per ${selectedPlan === "yearly" ? "year" : "month"}`
              : "Subscribe"
          }
          accessibilityState={{ disabled: isLoading || !canPurchase }}
          style={({ pressed }) => [
            styles.subscribeButton,
            { opacity: pressed || isLoading || !canPurchase ? 0.6 : 1 },
          ]}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color="#000000" />
          ) : (
            <ThemedText style={styles.subscribeButtonText}>
              {!canPurchase
                ? "Connecting to store…"
                : selectedPlan === "yearly"
                  ? `Subscribe for ${selectedProduct!.price}/year`
                  : `Subscribe for ${selectedProduct!.price}/month`}
            </ThemedText>
          )}
        </Pressable>

        <Pressable
          onPress={handleRestorePurchases}
          disabled={isRestoring}
          accessibilityRole="button"
          accessibilityLabel="Restore previous purchases"
          style={({ pressed }) => [
            styles.restoreButton,
            { opacity: pressed || isRestoring ? 0.7 : 1 },
          ]}
        >
          {isRestoring ? (
            <ActivityIndicator size="small" color={Colors.dark.accent} />
          ) : (
            <ThemedText
              style={[styles.restoreButtonText, { color: Colors.dark.accent }]}
            >
              Restore Purchases
            </ThemedText>
          )}
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
  heroSection: {
    alignItems: "center",
    marginBottom: Spacing["2xl"],
  },
  heroIcon: {
    width: 72,
    height: 72,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.lg,
  },
  heroTitle: {
    ...Typography.title,
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  heroSubtitle: {
    ...Typography.body,
    textAlign: "center",
    maxWidth: 300,
  },
  plansSection: {
    gap: Spacing.md,
    marginBottom: Spacing["2xl"],
  },
  planCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
  },
  planHeader: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
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
  planInfo: {},
  planPrice: {
    ...Typography.title,
  },
  planPeriod: {
    ...Typography.small,
  },
  savingsBadge: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  savingsText: {
    ...Typography.small,
    fontWeight: "600",
  },
  featuresSection: {
    marginBottom: Spacing["2xl"],
  },
  featuresSectionTitle: {
    ...Typography.headline,
    marginBottom: Spacing.lg,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    ...Typography.body,
    fontWeight: "500",
    marginBottom: 2,
  },
  featureDescription: {
    ...Typography.small,
  },
  premiumBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  premiumBadgeText: {
    ...Typography.caption,
    color: "#000000",
    fontWeight: "700",
  },
  freeFeatures: {
    marginBottom: Spacing.xl,
  },
  freeFeaturesTitle: {
    ...Typography.headline,
    marginBottom: Spacing.lg,
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
    marginBottom: Spacing.md,
  },
  subscribeButtonText: {
    ...Typography.headline,
    color: "#000000",
  },
  restoreButton: {
    alignItems: "center",
    paddingVertical: Spacing.md,
  },
  restoreButtonText: {
    ...Typography.body,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  planLoadingCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    gap: Spacing.sm,
  },
  planLoadingText: {
    ...Typography.body,
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
  legalLinks: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.md,
  },
  legalLink: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  legalLinkText: {
    ...Typography.caption,
    textDecorationLine: "underline",
  },
  legalSeparator: {
    ...Typography.caption,
  },
  subscriptionDisclosure: {
    ...Typography.caption,
    textAlign: "center",
    marginBottom: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    lineHeight: 18,
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
