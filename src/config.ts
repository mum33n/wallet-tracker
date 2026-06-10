import dotenv from "dotenv";
dotenv.config();

function require_env(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing env var: ${key}`);
  return val;
}

export interface WalletConfig {
  address: string;
  label: string;
}

function parseWallets(): WalletConfig[] {
  const raw = require_env("WALLETS");
  return raw.split(",").map((entry) => {
    const [address, label] = entry.trim().split(":");
    if (!address) throw new Error(`Invalid wallet entry: ${entry}`);
    return { address: address.trim(), label: (label || address.slice(0, 6)).trim() };
  });
}

export const config = {
  heliusApiKey: require_env("HELIUS_API_KEY"),
  heliusWsUrl: `wss://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`,
  heliusRpcUrl: `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`,
  heliusEnhancedUrl: `https://api.helius.xyz/v0/transactions/?api-key=${process.env.HELIUS_API_KEY}`,
  telegramToken: require_env("TELEGRAM_BOT_TOKEN"),
  telegramChatId: require_env("TELEGRAM_CHAT_ID"),
  wallets: parseWallets(),
  minUsdValue: parseFloat(process.env.MIN_USD_VALUE || "0"),
};
