-- Create auth schema and auth.uid() function compatible with JWT / session claims
CREATE SCHEMA IF NOT EXISTS "auth";
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "auth"."uid"()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('auth.user_id', true), '')
  )::text;
$$;
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "users_isolation" ON "users" FOR ALL USING ("id" = "auth"."uid"()) WITH CHECK ("id" = "auth"."uid"());
--> statement-breakpoint
ALTER TABLE "auth_sessions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "auth_sessions_isolation" ON "auth_sessions" FOR ALL USING ("user_id" = "auth"."uid"()) WITH CHECK ("user_id" = "auth"."uid"());
--> statement-breakpoint
ALTER TABLE "booth_sessions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "booth_sessions_isolation" ON "booth_sessions" FOR ALL USING ("user_id" = "auth"."uid"()) WITH CHECK ("user_id" = "auth"."uid"());
--> statement-breakpoint
ALTER TABLE "photo_strips" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "photo_strips_isolation" ON "photo_strips" FOR ALL USING ("user_id" = "auth"."uid"()) WITH CHECK ("user_id" = "auth"."uid"());
--> statement-breakpoint
ALTER TABLE "captured_photos" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "captured_photos_isolation" ON "captured_photos" FOR ALL USING ("session_id" IN (SELECT "id" FROM "booth_sessions" WHERE "user_id" = "auth"."uid"())) WITH CHECK ("session_id" IN (SELECT "id" FROM "booth_sessions" WHERE "user_id" = "auth"."uid"()));
--> statement-breakpoint
ALTER TABLE "presets" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "presets_read" ON "presets" FOR SELECT USING (true);
--> statement-breakpoint
CREATE POLICY "presets_write" ON "presets" FOR ALL USING ("auth"."uid"() IS NOT NULL) WITH CHECK ("auth"."uid"() IS NOT NULL);
