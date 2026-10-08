-- Migration 0002: Polar subscriptions & user plan support
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "plan" varchar(50) DEFAULT 'free' NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "polar_customer_id" varchar(64);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscriptions" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "polar_customer_id" varchar(64) NOT NULL,
  "polar_subscription_id" varchar(64),
  "polar_order_id" varchar(64),
  "product_id" varchar(64) NOT NULL,
  "plan" varchar(50) NOT NULL,
  "status" varchar(30) NOT NULL,
  "current_period_end" timestamp with time zone,
  "cancel_at_period_end" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriptions_user_idx" ON "subscriptions" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriptions_polar_customer_idx" ON "subscriptions" ("polar_customer_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "subscriptions_polar_sub_idx" ON "subscriptions" ("polar_subscription_id");
--> statement-breakpoint
ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "subscriptions_isolation" ON "subscriptions" FOR ALL USING ("user_id" = "auth"."uid"()) WITH CHECK ("user_id" = "auth"."uid"());
