import app from "./app";
import { logger } from "./lib/logger";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// ── Startup Diagnostics ──────────────────────────────────────────────────────
async function runDiagnostics() {
  logger.info("Running startup diagnostics...");

  // 1. Check critical environment variables
  const criticalEnvVars = ["DATABASE_URL"];
  const missing = criticalEnvVars.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    logger.warn({ missing }, "Missing recommended production environment variables");
  }

  // 2. Validate database connection
  try {
    await db.execute(sql`SELECT 1`);
    logger.info("Database connection validated successfully.");
  } catch (err) {
    logger.error({ err }, "Startup Diagnostics Failed: Could not connect to database.");
    process.exit(1);
  }
}

// Start Server
const server = app.listen(port, async () => {
  await runDiagnostics();
  logger.info({ port }, "Server listening and ready for requests");
});

// ── Graceful Shutdown ────────────────────────────────────────────────────────
const shutdownSignals = ["SIGTERM", "SIGINT"];
for (const signal of shutdownSignals) {
  process.on(signal, () => {
    logger.info({ signal }, "Received shutdown signal. Commencing graceful shutdown...");

    server.close((err) => {
      if (err) {
        logger.error({ err }, "Error closing active server connections");
        process.exit(1);
      }
      logger.info("Server connections successfully terminated.");
      process.exit(0);
    });

    // Enforce hard shutdown timeout (e.g. 10s)
    setTimeout(() => {
      logger.error("Graceful shutdown timeout exceeded. Enforcing process exit.");
      process.exit(1);
    }, 10000);
  });
}

