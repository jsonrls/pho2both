-- The existing app tables predate migration tracking. This migration adds
-- authentication and ownership support without changing stored ownership.
SET LOCAL lock_timeout = '5s';
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
  "token_hash" varchar(64) PRIMARY KEY NOT NULL,
  "user_id" varchar(36) NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" ("user_id");
--> statement-breakpoint
CREATE INDEX "auth_sessions_expiry_idx" ON "auth_sessions" ("expires_at");
--> statement-breakpoint
ALTER TABLE "booth_sessions" ADD COLUMN "guest_owner_hash" varchar(64);
--> statement-breakpoint
ALTER TABLE "photo_strips" ALTER COLUMN "share_code" TYPE varchar(64);
--> statement-breakpoint
CREATE INDEX "booth_sessions_owner_idx" ON "booth_sessions" ("user_id");
--> statement-breakpoint
CREATE INDEX "booth_sessions_guest_idx" ON "booth_sessions" ("guest_owner_hash");
--> statement-breakpoint
CREATE UNIQUE INDEX "captured_photos_session_shot_idx" ON "captured_photos" ("session_id", "shot_index");
--> statement-breakpoint
CREATE INDEX "photo_strips_owner_idx" ON "photo_strips" ("user_id");
--> statement-breakpoint
CREATE INDEX "photo_strips_expiry_idx" ON "photo_strips" ("expires_at");
