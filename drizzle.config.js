import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./src/db/migrations",
  schema: "./src/db/schema.js",
  dialect: "postgresql",
  // ✅ must specify your database dialect
  dbCredentials: {
            connectionString: process.env.DATABASE_URL || "postgresql://postgres.sviqeffsultqmyignrfi:wildcrackB1@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres",
            url: process.env.DATABASE_URL || "postgresql://postgres.sviqeffsultqmyignrfi:wildcrackB1@aws-1-ap-southeast-1.pooler.supabase.com:6543/postgres"
  },
});
