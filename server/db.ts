import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  console.warn("DATABASE_URL not set. Database features will be unavailable.");
}

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
    })
  : null;

export const db = pool ? drizzle(pool, { schema }) : null;

// Idempotent schema bootstrap, run at server startup: a fresh deployment
// creates its tables without a manual `drizzle-kit push` step. Additive only
// (IF NOT EXISTS) — future schema *changes* still go through drizzle-kit.
// Must match shared/schema.ts.
const BOOTSTRAP_DDL = `
CREATE TABLE IF NOT EXISTS "website_feedback" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL,
  "feedback_type" text NOT NULL,
  "message" text NOT NULL,
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE TABLE IF NOT EXISTS "device_subscriptions" (
  "id" serial PRIMARY KEY NOT NULL,
  "device_id" text NOT NULL,
  "provider_customer_id" text,
  "provider_transaction_id" text,
  "plan" text DEFAULT 'free' NOT NULL,
  "status" text DEFAULT 'inactive' NOT NULL,
  "current_period_end" timestamp,
  "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "device_subscriptions_device_id_unique" UNIQUE("device_id")
);
CREATE TABLE IF NOT EXISTS "device_ai_usage" (
  "id" serial PRIMARY KEY NOT NULL,
  "device_id" text NOT NULL,
  "month" text NOT NULL,
  "endpoint" text NOT NULL,
  "count" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "device_ai_usage_key"
  ON "device_ai_usage" USING btree ("device_id","month","endpoint");
CREATE TABLE IF NOT EXISTS "device_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "device_id" text NOT NULL,
  "day" text NOT NULL,
  "event" text NOT NULL,
  "count" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "device_events_key"
  ON "device_events" USING btree ("device_id","day","event");
CREATE TABLE IF NOT EXISTS "rate_limit_windows" (
  "id" serial PRIMARY KEY NOT NULL,
  "scope" text NOT NULL,
  "client_key" text NOT NULL,
  "window_id" text NOT NULL,
  "count" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "rate_limit_windows_key"
  ON "rate_limit_windows" USING btree ("scope","client_key","window_id");
`;

export async function ensureSchema(): Promise<void> {
  if (!pool) return;
  try {
    await pool.query(BOOTSTRAP_DDL);
    console.log("Database schema ensured");
  } catch (error) {
    // Non-fatal: the server still serves legal pages and degrades like the
    // rest of the app when the database is unreachable.
    console.error("Schema bootstrap failed (continuing):", error);
  }
}
