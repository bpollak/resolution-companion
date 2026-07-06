import { sql } from "drizzle-orm";
import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// All goal/persona/progress data lives on-device in AsyncStorage. The server
// only persists website feedback and device-keyed subscription entitlements.

export const websiteFeedback = pgTable("website_feedback", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  feedbackType: text("feedback_type").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

export const deviceSubscriptions = pgTable("device_subscriptions", {
  id: serial("id").primaryKey(),
  deviceId: text("device_id").notNull().unique(),
  // IAP provider references: for iOS this holds `iap_ios_<originalTransactionId>`
  // (stable across renewals, matching App Store Server Notifications); for
  // Android it holds `iap_android_<purchaseToken>` so Play webhooks can be
  // matched to the exact subscription they concern.
  providerCustomerId: text("provider_customer_id"),
  providerTransactionId: text("provider_transaction_id"),
  plan: text("plan").default("free").notNull(),
  status: text("status").default("inactive").notNull(),
  currentPeriodEnd: timestamp("current_period_end"),
  createdAt: timestamp("created_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: timestamp("updated_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

export const insertWebsiteFeedbackSchema = createInsertSchema(
  websiteFeedback,
).omit({ id: true, createdAt: true });
export const insertDeviceSubscriptionSchema = createInsertSchema(
  deviceSubscriptions,
).omit({ id: true, createdAt: true });

export type WebsiteFeedback = typeof websiteFeedback.$inferSelect;
export type InsertWebsiteFeedback = z.infer<typeof insertWebsiteFeedbackSchema>;
export type DeviceSubscription = typeof deviceSubscriptions.$inferSelect;
export type InsertDeviceSubscription = z.infer<
  typeof insertDeviceSubscriptionSchema
>;
