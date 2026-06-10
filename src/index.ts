import { startTracking } from "./subscriber";
import { sendAlert } from "./telegram";
import { config } from "./config";

async function main() {
  // Startup notification
  const walletList = config.wallets
    .map((w) => `• <b>${w.label}</b>: <code>${w.address.slice(0, 8)}...</code>`)
    .join("\n");

  await sendAlert(
    `✅ <b>Wallet Tracker Online</b>\n\n` +
    `Monitoring ${config.wallets.length} wallet(s):\n${walletList}\n\n` +
    `Tracking: DEX swaps + token transfers`
  );

  startTracking();

  // Graceful shutdown
  process.on("SIGINT", async () => {
    console.log("\n[Main] Shutting down...");
    await sendAlert("⚠️ <b>Wallet Tracker Offline</b> (SIGINT)");
    process.exit(0);
  });

  process.on("uncaughtException", (err) => {
    console.error("[Main] Uncaught exception:", err);
  });

  process.on("unhandledRejection", (reason) => {
    console.error("[Main] Unhandled rejection:", reason);
  });
}

main().catch(console.error);
