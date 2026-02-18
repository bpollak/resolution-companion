import React, { useState, useEffect, useRef } from "react";
import { View, ScrollView, StyleSheet, Pressable, Platform, Alert, AppState } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";

import { useTheme } from "@/hooks/useTheme";
import { useApp } from "@/context/AppContext";
import { Colors, Spacing, Typography, BorderRadius } from "@/constants/theme";
import { ThemedText } from "@/components/ThemedText";
import { getApiUrl } from "@/lib/query-client";
import { storage } from "@/lib/storage";
import { iapService, PRODUCT_IDS, IAPProduct, IAPPurchase } from "@/lib/iap";

type PlanType = "monthly" | "yearly";

interface PlanCardProps {
  type: PlanType;
  price: string;
  period: string;
  savings?: string;
  selected: boolean;
  onSelect: () => void;
}

function PlanCard({ type, price, period, savings, selected, onSelect }: PlanCardProps) {
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
            { borderColor: selected ? Colors.dark.accent : theme.textSecondary },
          ]}
        >
          {selected ? (
            <View style={[styles.radioInner, { backgroundColor: Colors.dark.accent }]} />
          ) : null}
        </View>
        <View style={styles.planInfo}>
          <ThemedText style={styles.planPrice}>{price}</ThemedText>
          <ThemedText style={[styles.planPeriod, { color: theme.textSecondary }]}>
            {period}
          </ThemedText>
        </View>
      </View>
      {savings ? (
        <View style={[styles.savingsBadge, { backgroundColor: "rgba(0, 217, 255, 0.15)" }]}>
          <ThemedText style={[styles.savingsText, { color: Colors.dark.accent }]}>
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

function FeatureRow({ icon, title, description, isPremium = false }: FeatureRowProps) {
  const { theme } = useTheme();

  return (
    <View style={styles.featureRow}>
      <View
        style={[
          styles.featureIcon,
          { backgroundColor: isPremium ? "rgba(0, 217, 255, 0.1)" : "rgba(255,255,255,0.05)" },
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
        <ThemedText style={[styles.featureDescription, { color: theme.textSecondary }]}>
          {description}
        </ThemedText>
      </View>
      {isPremium ? (
        <View style={[styles.premiumBadge, { backgroundColor: Colors.dark.accent }]}>
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
  const { subscription, upgradeToPremium, refreshData } = useApp();
  const [selectedPlan, setSelectedPlan] = useState<PlanType>("yearly");
  const [isLoading, setIsLoading] = useState(false);
  const [iapProducts, setIapProducts] = useState<IAPProduct[]>([]);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [useNativeIAP, setUseNativeIAP] = useState(false);
  const [iapError, setIapError] = useState<string | null>(null);
  const [initializationComplete, setInitializationComplete] = useState(false);
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    initializePurchases();
    checkSubscriptionStatus();
  }, []);

  const initializePurchases = async () => {
    setIapError(null);
    
    const timeoutPromise = new Promise<void>((resolve) => {
      setTimeout(() => {
        console.log("IAP initialization timeout - using fallback");
        resolve();
      }, 15000);
    });
    
    const initPromise = async () => {
      try {
        const isAvailable = await iapService.isAvailable();

        if (!isAvailable) {
          console.log("Native IAP not available on this device");
          return;
        }

        const products = await iapService.getProducts();

        if (products.length > 0) {
          console.log("IAP products loaded:", products.length);
          setIapProducts(products);
          setUseNativeIAP(true);

          iapService.setPurchaseListener(
              async (purchase: IAPPurchase) => {
                try {
                  const plan = iapService.getPlanFromProductId(purchase.productId);
                  const expiryMs = plan === "yearly"
                    ? Date.now() + 365 * 24 * 60 * 60 * 1000
                    : Date.now() + 30 * 24 * 60 * 60 * 1000;
                  const newSubscription = {
                    isPremium: true,
                    plan: plan,
                    expiresAt: new Date(expiryMs).toISOString(),
                    purchasedAt: new Date().toISOString(),
                  };
                  await storage.setSubscription(newSubscription);
                  await refreshData();
                  setIsLoading(false);
                  Alert.alert("Success", "Welcome to Premium! Your subscription is now active.");
                } catch (err) {
                  console.error("Error processing purchase:", err);
                  setIsLoading(false);
                  Alert.alert(
                    "Purchase Issue",
                    "Your payment was processed but we had trouble activating your subscription. Please use Restore Purchases.",
                    [
                      { text: "OK", style: "default" },
                      { text: "Restore", onPress: () => handleRestorePurchases() }
                    ]
                  );
                }
              },
              (error: Error) => {
                console.error("Purchase error:", error);
                setIsLoading(false);

                const errorMessage = error.message || "There was a problem with your purchase.";
                if (errorMessage.includes("cancel") || errorMessage.includes("USER_CANCELED")) {
                  return;
                }

                Alert.alert(
                  "Purchase Failed",
                  "We couldn't complete your purchase. Please try again or contact support if the issue persists.",
                  [
                    { text: "OK", style: "default" },
                    { text: "Restore", onPress: () => handleRestorePurchases() }
                  ]
                );
              }
            );
          } else {
            console.log("No IAP products returned from store");
          }
        } catch (error) {
          console.error("IAP initialization failed:", error);
        }
    };

    // Race between initialization and timeout
    await Promise.race([initPromise(), timeoutPromise]);

    setInitializationComplete(true);
  };

  useEffect(() => {
    const appStateSubscription = AppState.addEventListener('change', nextAppState => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        checkSubscriptionStatus();
      }
      appState.current = nextAppState;
    });

    return () => {
      appStateSubscription.remove();
    };
  }, []);

  const checkSubscriptionStatus = async () => {
    try {
      setCheckingStatus(true);
      const deviceId = await storage.getDeviceId();
      const response = await fetch(new URL(`/api/subscription/status/${deviceId}`, getApiUrl()).toString());
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
      console.error("Failed to check subscription status:", error);
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
      Alert.alert("Please Wait", "Still loading purchase options. Please try again in a moment.");
      return;
    }
    
    setIsLoading(true);
    setIapError(null);
    
    try {
      if (Platform.OS === "ios") {
        if (!useNativeIAP) {
          setIsLoading(false);
          Alert.alert(
            "Store Connection",
            "Unable to connect to the App Store. Please check your internet connection and try again.",
            [
              { text: "OK", style: "default" },
              { text: "Retry", onPress: () => {
                initializePurchases().then(() => handleSubscribe());
              }}
            ]
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
              { text: "Retry", onPress: () => initializePurchases() }
            ]
          );
          return;
        }
        
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        await iapService.purchaseProduct(productId);
      } else if (Platform.OS === "android") {
        const productId = getIAPProductId(selectedPlan);
        if (!productId) {
          setIsLoading(false);
          Alert.alert(
            "Product Unavailable",
            "This subscription option is temporarily unavailable. Please try again later.",
            [
              { text: "OK", style: "default" },
              { text: "Retry", onPress: () => initializePurchases() }
            ]
          );
          return;
        }

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        await iapService.purchaseProduct(productId);
      }
    } catch (error: any) {
      console.error("Purchase failed:", error);
      setIsLoading(false);

      const errorMessage = error?.message || "";
      if (errorMessage.includes("cancel") || errorMessage.includes("USER_CANCELED")) {
        return;
      }

      Alert.alert(
        "Purchase Error",
        "We couldn't complete your purchase. Please check your connection and try again.",
        [
          { text: "OK", style: "default" },
          { text: "Retry", onPress: () => handleSubscribe() }
        ]
      );
    }
  };

  const handleRestorePurchases = async () => {
    setCheckingStatus(true);

    if (useNativeIAP && Platform.OS !== "web") {
      try {
        const purchases = await iapService.restorePurchases();
        if (purchases.length > 0) {
          const latestPurchase = purchases[0];
          const plan = iapService.getPlanFromProductId(latestPurchase.productId);
          const expiryMs = plan === "yearly"
            ? Date.now() + 365 * 24 * 60 * 60 * 1000
            : Date.now() + 30 * 24 * 60 * 60 * 1000;
          const newSubscription = {
            isPremium: true,
            plan: plan,
            expiresAt: new Date(expiryMs).toISOString(),
            purchasedAt: new Date(latestPurchase.purchaseTime).toISOString(),
          };
          await storage.setSubscription(newSubscription);
          await refreshData();
          Alert.alert("Success", "Your subscription has been restored!");
          setCheckingStatus(false);
          return;
        } else {
          // Native IAP found no purchases — try the server-side DB record as a fallback
          // (covers reinstalls where the purchase was validated and stored previously)
          await restoreFromServer();
          return;
        }
      } catch (error) {
        console.error("Native restore failed:", error);
        await restoreFromServer();
        return;
      }
    }

    setCheckingStatus(false);
  };

  const restoreFromServer = async () => {
    try {
      const deviceId = await storage.getDeviceId();
      const response = await fetch(new URL("/api/subscription/restore", getApiUrl()).toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId }),
      });

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
        Alert.alert("Success", "Your subscription has been restored!");
      } else {
        Alert.alert(
          "No Purchases Found",
          "We couldn't find an active subscription for this device. If you believe this is an error, please contact support."
        );
      }
    } catch (error) {
      console.error("Failed to restore subscription from server:", error);
      Alert.alert("Error", "Failed to restore subscription. Please try again.");
    } finally {
      setCheckingStatus(false);
    }
  };

  if (subscription.isPremium) {
    return (
      <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
        <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
          <Pressable onPress={() => navigation.goBack()} style={styles.closeButton}>
            <Feather name="x" size={24} color={theme.text} />
          </Pressable>
          <ThemedText style={styles.headerTitle}>Premium</ThemedText>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.premiumActiveContainer}>
          <View style={[styles.premiumActiveIcon, { backgroundColor: Colors.dark.accent }]}>
            <Feather name="check" size={48} color="#000000" />
          </View>
          <ThemedText style={styles.premiumActiveTitle}>You're Premium!</ThemedText>
          <ThemedText style={[styles.premiumActiveSubtitle, { color: theme.textSecondary }]}>
            You have unlimited access to all features.
          </ThemedText>
          {subscription.expiresAt ? (
            <ThemedText style={[styles.expiresText, { color: theme.textSecondary }]}>
              Your subscription renews on{" "}
              {new Date(subscription.expiresAt).toLocaleDateString()}
            </ThemedText>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.closeButton}>
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
          <View style={[styles.errorBanner, { backgroundColor: "rgba(255, 100, 100, 0.15)" }]}>
            <Feather name="alert-circle" size={20} color="#FF6B6B" />
            <ThemedText style={[styles.errorText, { color: "#FF6B6B" }]}>
              {iapError}
            </ThemedText>
            <Pressable 
              onPress={() => initializePurchases()} 
              style={styles.retryButton}
            >
              <ThemedText style={[styles.retryButtonText, { color: Colors.dark.accent }]}>
                Retry
              </ThemedText>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.heroSection}>
          <View style={[styles.heroIcon, { backgroundColor: Colors.dark.accent }]}>
            <Feather name="zap" size={32} color="#000000" />
          </View>
          <ThemedText style={styles.heroTitle}>Unlock Your Full Potential</ThemedText>
          <ThemedText style={[styles.heroSubtitle, { color: theme.textSecondary }]}>
            Get unlimited access to all premium features and accelerate your personal evolution.
          </ThemedText>
        </View>

        <View style={styles.plansSection}>
          <PlanCard
            type="yearly"
            price="$24.99"
            period="per year"
            savings="Save 30%"
            selected={selectedPlan === "yearly"}
            onSelect={() => setSelectedPlan("yearly")}
          />
          <PlanCard
            type="monthly"
            price="$2.99"
            period="per month"
            selected={selectedPlan === "monthly"}
            onSelect={() => setSelectedPlan("monthly")}
          />
        </View>

        <View style={styles.featuresSection}>
          <ThemedText style={styles.featuresSectionTitle}>Premium Features</ThemedText>
          
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
          <ThemedText style={[styles.freeFeaturesTitle, { color: theme.textSecondary }]}>
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
        <Pressable
          onPress={handleSubscribe}
          disabled={isLoading}
          style={({ pressed }) => [
            styles.subscribeButton,
            { opacity: pressed || isLoading ? 0.8 : 1 },
          ]}
        >
          <ThemedText style={styles.subscribeButtonText}>
            {isLoading
              ? "Processing..."
              : selectedPlan === "yearly"
                ? "Subscribe for $24.99/year"
                : "Subscribe for $2.99/month"}
          </ThemedText>
        </Pressable>

        <Pressable onPress={handleRestorePurchases} style={styles.restoreButton}>
          <ThemedText style={[styles.restoreButtonText, { color: theme.textSecondary }]}>
            Restore Purchases
          </ThemedText>
        </Pressable>

        <ThemedText style={[styles.subscriptionDisclosure, { color: theme.textSecondary }]}>
          {selectedPlan === "yearly" 
            ? "Subscription automatically renews for $24.99/year unless canceled at least 24 hours before the end of the current period. "
            : "Subscription automatically renews for $2.99/month unless canceled at least 24 hours before the end of the current period. "}
          Your account will be charged for renewal within 24 hours prior to the end of the current period. 
          You can manage and cancel your subscription in your App Store settings after purchase.
        </ThemedText>

        <View style={styles.legalLinks}>
          <Pressable 
            onPress={() => WebBrowser.openBrowserAsync(`${getApiUrl()}/terms`)}
            style={styles.legalLink}
          >
            <ThemedText style={[styles.legalLinkText, { color: theme.textSecondary }]}>
              Terms of Use
            </ThemedText>
          </Pressable>
          <ThemedText style={[styles.legalSeparator, { color: theme.textSecondary }]}>|</ThemedText>
          <Pressable 
            onPress={() => WebBrowser.openBrowserAsync(`${getApiUrl()}/privacy`)}
            style={styles.legalLink}
          >
            <ThemedText style={[styles.legalLinkText, { color: theme.textSecondary }]}>
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
    paddingVertical: Spacing.sm,
  },
  restoreButtonText: {
    ...Typography.small,
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
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
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
