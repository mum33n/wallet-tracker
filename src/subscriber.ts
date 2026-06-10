import WebSocket from "ws";
import { config, WalletConfig } from "./config";
import { parseAndAlert } from "./parser";

const RECONNECT_DELAY_MS = 5000;
const PING_INTERVAL_MS = 30000;

// Track seen signatures to avoid double-processing
const seenSignatures = new Set<string>();

interface SubscriptionState {
  ws: WebSocket | null;
  subscriptionId: number | null;
  wallet: WalletConfig;
  pingTimer: NodeJS.Timeout | null;
  reconnectTimer: NodeJS.Timeout | null;
  requestId: number;
}

function createSubscriber(wallet: WalletConfig): SubscriptionState {
  const state: SubscriptionState = {
    ws: null,
    subscriptionId: null,
    wallet,
    pingTimer: null,
    reconnectTimer: null,
    requestId: 1,
  };

  connect(state);
  return state;
}

function connect(state: SubscriptionState): void {
  console.log(`[WS] Connecting for wallet: ${state.wallet.label} (${state.wallet.address.slice(0, 8)}...)`);

  const ws = new WebSocket(config.heliusWsUrl);
  state.ws = ws;

  ws.on("open", () => {
    console.log(`[WS] Connected for ${state.wallet.label}`);
    subscribe(state);

    // Keepalive ping
    state.pingTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, PING_INTERVAL_MS);
  });

  ws.on("message", async (data: WebSocket.RawData) => {
    try {
      const msg = JSON.parse(data.toString());

      // Subscription confirmation
      if (msg.id && msg.result !== undefined) {
        state.subscriptionId = msg.result;
        console.log(`[WS] Subscribed for ${state.wallet.label} (sub ID: ${state.subscriptionId})`);
        return;
      }

      // Log notification
      if (msg.method === "logsNotification" && msg.params?.result) {
        const { signature, err } = msg.params.result.value;

        if (err) return; // Skip failed txns
        if (seenSignatures.has(signature)) return;
        seenSignatures.add(signature);

        // Prune cache to avoid unbounded growth
        if (seenSignatures.size > 10000) {
          const iter = seenSignatures.values();
          for (let i = 0; i < 1000; i++) {
            const { value, done } = iter.next();
            if (done) break;
            seenSignatures.delete(value);
          }
        }

        console.log(`[WS] New tx for ${state.wallet.label}: ${signature}`);

        // Small delay to let Helius index the tx before fetching
        setTimeout(async () => {
          await parseAndAlert(signature, state.wallet.address, state.wallet.label);
        }, 2000);
      }
    } catch (err) {
      console.error(`[WS] Parse error for ${state.wallet.label}:`, err);
    }
  });

  ws.on("close", (code, reason) => {
    console.warn(`[WS] Disconnected for ${state.wallet.label}: code=${code} reason=${reason}`);
    cleanup(state);
    scheduleReconnect(state);
  });

  ws.on("error", (err) => {
    console.error(`[WS] Error for ${state.wallet.label}:`, err.message);
  });
}

function subscribe(state: SubscriptionState): void {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;

  const payload = {
    jsonrpc: "2.0",
    id: state.requestId++,
    method: "logsSubscribe",
    params: [
      { mentions: [state.wallet.address] },
      { commitment: "confirmed" },
    ],
  };

  state.ws.send(JSON.stringify(payload));
}

function cleanup(state: SubscriptionState): void {
  if (state.pingTimer) {
    clearInterval(state.pingTimer);
    state.pingTimer = null;
  }
  if (state.ws) {
    state.ws.removeAllListeners();
    state.ws = null;
  }
  state.subscriptionId = null;
}

function scheduleReconnect(state: SubscriptionState): void {
  if (state.reconnectTimer) return;
  console.log(`[WS] Reconnecting for ${state.wallet.label} in ${RECONNECT_DELAY_MS / 1000}s...`);
  state.reconnectTimer = setTimeout(() => {
    state.reconnectTimer = null;
    connect(state);
  }, RECONNECT_DELAY_MS);
}

export function startTracking(): void {
  console.log(`\n🚀 Starting Solana wallet tracker`);
  console.log(`📡 Tracking ${config.wallets.length} wallet(s):\n`);
  config.wallets.forEach((w) => console.log(`  • ${w.label}: ${w.address}`));
  console.log("\n");

  for (const wallet of config.wallets) {
    createSubscriber(wallet);
  }
}
