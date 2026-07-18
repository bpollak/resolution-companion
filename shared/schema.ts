import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
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

// Server-side monthly usage counters for the OpenAI-backed endpoints. The
// client-side free-tier limit is advisory only — the API key ships in the app
// bundle — so this table is the enforcement of record. Keyed by device (or
// client IP when no device header is present) + calendar month + endpoint.
export const deviceAiUsage = pgTable(
  "device_ai_usage",
  {
    id: serial("id").primaryKey(),
    deviceId: text("device_id").notNull(),
    month: text("month").notNull(), // YYYY-MM
    endpoint: text("endpoint").notNull(), // chat | reflection | extract
    count: integer("count").default(0).notNull(),
    updatedAt: timestamp("updated_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => ({
    deviceMonthEndpoint: uniqueIndex("device_ai_usage_key").on(
      table.deviceId,
      table.month,
      table.endpoint,
    ),
  }),
);

// Privacy-respecting product telemetry: daily event COUNTS only, keyed by the
// same anonymous device UUID as subscriptions. No payloads, no timestamps
// finer than a calendar day, no PII — enough to see activation/retention/
// conversion funnels in aggregate and nothing else.
export const deviceEvents = pgTable(
  "device_events",
  {
    id: serial("id").primaryKey(),
    deviceId: text("device_id").notNull(),
    day: text("day").notNull(), // YYYY-MM-DD, device-local calendar day
    event: text("event").notNull(),
    count: integer("count").default(0).notNull(),
    updatedAt: timestamp("updated_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => ({
    deviceDayEvent: uniqueIndex("device_events_key").on(
      table.deviceId,
      table.day,
      table.event,
    ),
  }),
);

// Fixed-window request counters shared by every server instance. The window
// id is an epoch bucket; old rows are harmless and can be pruned operationally.
export const rateLimitWindows = pgTable(
  "rate_limit_windows",
  {
    id: serial("id").primaryKey(),
    scope: text("scope").notNull(),
    clientKey: text("client_key").notNull(),
    windowId: text("window_id").notNull(),
    count: integer("count").default(0).notNull(),
    updatedAt: timestamp("updated_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => ({
    scopeClientWindow: uniqueIndex("rate_limit_windows_key").on(
      table.scope,
      table.clientKey,
      table.windowId,
    ),
  }),
);

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
