import { loadEnv } from "../env";
import { startServer } from "./server";

// Prevent silent death from unhandled errors
process.on("uncaughtException", (err) => {
  console.error(`[companion] uncaught exception: ${err.message}`);
  console.error(err.stack);
});
process.on("unhandledRejection", (err: any) => {
  console.error(`[companion] unhandled rejection: ${err?.message || err}`);
});

await loadEnv();
startServer();
