import { env } from "./config/env";
import { app } from "./app";
import { initCycleReminderJob } from "./jobs/cycle-reminder.job";

const PORT = env.PORT;

const server = app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT} in ${env.NODE_ENV} mode.`);

  // Start daily cycle-reminder cron job (only when explicitly enabled)
  if (env.CRON_ENABLED === "true") {
    initCycleReminderJob();
  }
});

// Handle graceful shutdown
const gracefulShutdown = () => {
  console.log("Received kill signal, shutting down gracefully...");
  server.close(() => {
    console.log("Closed out remaining connections.");
    process.exit(0);
  });
};

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

