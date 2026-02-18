import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, integer, boolean, timestamp, json } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  googleId: text("google_id").unique(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const personas = pgTable("personas", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const benchmarks = pgTable("benchmarks", {
  id: serial("id").primaryKey(),
  personaId: integer("persona_id").notNull().references(() => personas.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  targetDate: timestamp("target_date"),
  status: text("status").default("active").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const elementalActions = pgTable("elemental_actions", {
  id: serial("id").primaryKey(),
  benchmarkId: integer("benchmark_id").notNull().references(() => benchmarks.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  frequencyJson: json("frequency_json").$type<string[]>().default([]),
  anchorLink: text("anchor_link"),
  kickstartVersion: text("kickstart_version"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const dailyLogs = pgTable("daily_logs", {
  id: serial("id").primaryKey(),
  actionId: integer("action_id").notNull().references(() => elementalActions.id, { onDelete: "cascade" }),
  logDate: timestamp("log_date").notNull(),
  status: boolean("status").default(false).notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const reflections = pgTable("reflections", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  periodType: text("period_type").notNull(),
  userInput: text("user_input"),
  aiFeedback: text("ai_feedback"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const websiteFeedback = pgTable("website_feedback", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  feedbackType: text("feedback_type").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const deviceSubscriptions = pgTable("device_subscriptions", {
  id: serial("id").primaryKey(),
  deviceId: text("device_id").notNull().unique(),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  plan: text("plan").default("free").notNull(),
  status: text("status").default("inactive").notNull(),
  currentPeriodEnd: timestamp("current_period_end"),
  createdAt: timestamp("created_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export const insertPersonaSchema = createInsertSchema(personas).omit({ id: true, createdAt: true });
export const insertBenchmarkSchema = createInsertSchema(benchmarks).omit({ id: true, createdAt: true });
export const insertElementalActionSchema = createInsertSchema(elementalActions).omit({ id: true, createdAt: true });
export const insertDailyLogSchema = createInsertSchema(dailyLogs).omit({ id: true, createdAt: true });
export const insertReflectionSchema = createInsertSchema(reflections).omit({ id: true, createdAt: true });
export const insertConversationSchema = createInsertSchema(conversations).omit({ id: true, createdAt: true });
export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true });
export const insertWebsiteFeedbackSchema = createInsertSchema(websiteFeedback).omit({ id: true, createdAt: true });
export const insertDeviceSubscriptionSchema = createInsertSchema(deviceSubscriptions).omit({ id: true, createdAt: true });

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Persona = typeof personas.$inferSelect;
export type InsertPersona = z.infer<typeof insertPersonaSchema>;
export type Benchmark = typeof benchmarks.$inferSelect;
export type InsertBenchmark = z.infer<typeof insertBenchmarkSchema>;
export type ElementalAction = typeof elementalActions.$inferSelect;
export type InsertElementalAction = z.infer<typeof insertElementalActionSchema>;
export type DailyLog = typeof dailyLogs.$inferSelect;
export type InsertDailyLog = z.infer<typeof insertDailyLogSchema>;
export type Reflection = typeof reflections.$inferSelect;
export type InsertReflection = z.infer<typeof insertReflectionSchema>;
export type Conversation = typeof conversations.$inferSelect;
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type WebsiteFeedback = typeof websiteFeedback.$inferSelect;
export type InsertWebsiteFeedback = z.infer<typeof insertWebsiteFeedbackSchema>;
export type DeviceSubscription = typeof deviceSubscriptions.$inferSelect;
export type InsertDeviceSubscription = z.infer<typeof insertDeviceSubscriptionSchema>;
