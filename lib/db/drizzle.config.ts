import { defineConfig } from "drizzle-kit";
import path from "path";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  // Migrations output directory (used by drizzle-kit generate + migrate)
  // Push (drizzle-kit push) syncs directly without generating files — dev only.
  // For production with real customer data: always use generate → review → migrate.
  out: path.join(__dirname, "./migrations"),
});
