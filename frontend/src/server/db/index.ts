import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export const isNeonConfigured = (): boolean => {
  const databaseUrl = process.env.DATABASE_URL;
  return Boolean(
    databaseUrl &&
    databaseUrl.trim().length > 0 &&
    databaseUrl.startsWith("postgres")
  );
};

let dbInstance: ReturnType<typeof drizzle> | null = null;
let cachedUrl: string | null = null;

export const getDb = () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl?.trim()) {
    if (["development", "test"].includes(process.env.NODE_ENV || "")) return null;
    throw new Error("Database configuration required");
  }
  if (!isNeonConfigured()) throw new Error("Invalid database configuration");

  if (!dbInstance || cachedUrl !== databaseUrl) {
    const sql = neon(databaseUrl!);
    dbInstance = drizzle(sql, { schema });
    cachedUrl = databaseUrl;
  }

  return dbInstance;
};

export { schema };
