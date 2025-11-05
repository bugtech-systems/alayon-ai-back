import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./src/db/migrations",
  schema: "./src/db/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
        url: process.env.DATABASE_URL || "postgresql://postgres.jsglsqqymmxjffgpmoxe:Wildcrack!2026@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres",
  },
});
