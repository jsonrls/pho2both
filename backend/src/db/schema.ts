import { pgTable, text, varchar, timestamp, integer, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: varchar("id", { length: 36 }).primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull().default("User"),
  passwordHash: varchar("password_hash", { length: 255 }),
  salt: varchar("salt", { length: 64 }),
  avatarUrl: text("avatar_url"),
  provider: varchar("provider", { length: 30 }).default("email"),
  role: varchar("role", { length: 20 }).notNull().default("user"),
  plan: varchar("plan", { length: 50 }).notNull().default("free"),
  polarCustomerId: varchar("polar_customer_id", { length: 64 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const authSessions = pgTable("auth_sessions", {
  tokenHash: varchar("token_hash", { length: 64 }).primaryKey(),
  userId: varchar("user_id", { length: 36 }).references(() => users.id, { onDelete: "cascade" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, table => [index("auth_sessions_user_idx").on(table.userId), index("auth_sessions_expiry_idx").on(table.expiresAt)]);

export const boothSessions = pgTable("booth_sessions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: varchar("user_id", { length: 36 }),
  isGuest: boolean("is_guest").default(true).notNull(),
  guestOwnerHash: varchar("guest_owner_hash", { length: 64 }),
  sessionCode: varchar("session_code", { length: 12 }).notNull().unique(),
  boothName: varchar("booth_name", { length: 120 }).default("Pho2Booth"),
  theme: varchar("theme", { length: 50 }).default("neon-glow"),
  layout: varchar("layout", { length: 50 }).default("strip-4"),
  photoCount: integer("photo_count").default(4).notNull(),
  countdownSeconds: integer("countdown_seconds").default(3).notNull(),
  status: varchar("status", { length: 20 }).default("active").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, table => [index("booth_sessions_owner_idx").on(table.userId), index("booth_sessions_guest_idx").on(table.guestOwnerHash)]);

export const capturedPhotos = pgTable("captured_photos", {
  id: varchar("id", { length: 36 }).primaryKey(),
  sessionId: varchar("session_id", { length: 36 })
    .references(() => boothSessions.id, { onDelete: "cascade" })
    .notNull(),
  shotIndex: integer("shot_index").notNull(),
  imageData: text("image_data").notNull(),
  filterName: varchar("filter_name", { length: 50 }).default("normal").notNull(),
  width: integer("width").default(1280),
  height: integer("height").default(720),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => [uniqueIndex("captured_photos_session_shot_idx").on(table.sessionId, table.shotIndex)]);

export const photoStrips = pgTable("photo_strips", {
  id: varchar("id", { length: 36 }).primaryKey(),
  sessionId: varchar("session_id", { length: 36 })
    .references(() => boothSessions.id, { onDelete: "cascade" })
    .notNull(),
  userId: varchar("user_id", { length: 36 }),
  isGuest: boolean("is_guest").default(true).notNull(),
  expiresAt: timestamp("expires_at"),
  shareCode: varchar("share_code", { length: 64 }).notNull().unique(),
  stripData: text("strip_data").notNull(),
  template: varchar("template", { length: 50 }).default("vertical-strip").notNull(),
  headerText: varchar("header_text", { length: 120 }).default(""),
  footerText: varchar("footer_text", { length: 120 }).default("PHO2BOOTH • 2026"),
  frameColor: varchar("frame_color", { length: 30 }).default("#0f172a").notNull(),
  textColor: varchar("text_color", { length: 30 }).default("#f8fafc").notNull(),
  downloadCount: integer("download_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => [index("photo_strips_owner_idx").on(table.userId), index("photo_strips_expiry_idx").on(table.expiresAt)]);

export const presets = pgTable("presets", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  configJson: text("config_json").notNull(),
  isDefault: boolean("is_default").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const subscriptions = pgTable("subscriptions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: varchar("user_id", { length: 36 })
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  polarCustomerId: varchar("polar_customer_id", { length: 64 }).notNull(),
  polarSubscriptionId: varchar("polar_subscription_id", { length: 64 }),
  polarOrderId: varchar("polar_order_id", { length: 64 }),
  productId: varchar("product_id", { length: 64 }).notNull(),
  plan: varchar("plan", { length: 50 }).notNull(),
  status: varchar("status", { length: 30 }).notNull(),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, table => [
  index("subscriptions_user_idx").on(table.userId),
  index("subscriptions_polar_customer_idx").on(table.polarCustomerId),
  index("subscriptions_polar_sub_idx").on(table.polarSubscriptionId),
]);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type BoothSession = typeof boothSessions.$inferSelect;
export type NewBoothSession = typeof boothSessions.$inferInsert;

export type CapturedPhoto = typeof capturedPhotos.$inferSelect;
export type NewCapturedPhoto = typeof capturedPhotos.$inferInsert;

export type PhotoStrip = typeof photoStrips.$inferSelect;
export type NewPhotoStrip = typeof photoStrips.$inferInsert;

export type Preset = typeof presets.$inferSelect;
export type NewPreset = typeof presets.$inferInsert;

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
