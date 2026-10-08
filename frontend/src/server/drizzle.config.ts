import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";

dotenv.config();

const suppliedUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || "";
const directUrl = suppliedUrl ? new URL(suppliedUrl) : null;
if (directUrl) directUrl.hostname = directUrl.hostname.replace(/-pooler(?=\.)/, "");

export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./src/server/drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: directUrl?.toString() || "",
  },
});
