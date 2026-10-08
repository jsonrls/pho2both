import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema.js";
import * as dotenv from "dotenv";

dotenv.config();

const databaseUrl = process.env.DATABASE_URL;

export const isNeonConfigured = (): boolean => {
  return Boolean(
    databaseUrl &&
    databaseUrl.trim().length > 0 &&
    databaseUrl.startsWith("postgres")
  );
};

let dbInstance: ReturnType<typeof drizzle> | null = null;

export const getDb = () => {
  if (!databaseUrl?.trim()) {
    if (["development", "test"].includes(process.env.NODE_ENV || "")) return null;
    throw new Error("Database configuration required");
  }
  if (!isNeonConfigured()) throw new Error("Invalid database configuration");

  if (!dbInstance) {
    const sql = neon(databaseUrl!);
    dbInstance = drizzle(sql, { schema });
  }

  return dbInstance;
};

export { schema };
