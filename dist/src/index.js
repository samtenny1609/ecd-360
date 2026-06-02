"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const env_1 = require("./config/env");
const app_1 = require("./app");
const cycle_reminder_job_1 = require("./jobs/cycle-reminder.job");
const PORT = env_1.env.PORT;
const server = app_1.app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT} in ${env_1.env.NODE_ENV} mode.`);
    // Start daily cycle-reminder cron job (only when explicitly enabled)
    if (env_1.env.CRON_ENABLED === "true") {
        (0, cycle_reminder_job_1.initCycleReminderJob)();
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
