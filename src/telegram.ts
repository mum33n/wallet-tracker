import TelegramBot from "node-telegram-bot-api";
import { config } from "./config";

const bot = new TelegramBot(config.telegramToken, { polling: false });

export async function sendAlert(message: string): Promise<void> {
  try {
    await bot.sendMessage(config.telegramChatId, message, {
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
  } catch (err) {
    console.error("[Telegram] Failed to send alert:", err);
  }
}

export function formatSwapAlert(params: {
  walletLabel: string;
  walletAddress: string;
  signature: string;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  toAmount: string;
  usdValue?: number;
  dex?: string;
  timestamp: number;
}): string {
  const { walletLabel, walletAddress, signature, fromToken, toToken, fromAmount, toAmount, usdValue, dex, timestamp } = params;
  const time = new Date(timestamp * 1000).toUTCString();
  const usdStr = usdValue ? ` (~$${usdValue.toLocaleString()})` : "";
  const dexStr = dex ? ` on <b>${dex}</b>` : "";
  const shortSig = signature.slice(0, 8) + "..." + signature.slice(-8);
  const shortAddr = walletAddress.slice(0, 4) + "..." + walletAddress.slice(-4);

  return (
    `🔄 <b>DEX SWAP</b>${dexStr}\n` +
    `👤 <b>${walletLabel}</b> (<code>${shortAddr}</code>)\n` +
    `\n` +
    `<b>${fromAmount} ${fromToken}</b> → <b>${toAmount} ${toToken}</b>${usdStr}\n` +
    `\n` +
    `🕐 ${time}\n` +
    `🔗 <a href="https://solscan.io/tx/${signature}">View on Solscan</a> | <code>${shortSig}</code>`
  );
}

export function formatTransferAlert(params: {
  walletLabel: string;
  walletAddress: string;
  signature: string;
  direction: "IN" | "OUT";
  token: string;
  amount: string;
  usdValue?: number;
  counterparty?: string;
  timestamp: number;
}): string {
  const { walletLabel, walletAddress, signature, direction, token, amount, usdValue, counterparty, timestamp } = params;
  const time = new Date(timestamp * 1000).toUTCString();
  const usdStr = usdValue ? ` (~$${usdValue.toLocaleString()})` : "";
  const emoji = direction === "IN" ? "📥" : "📤";
  const dirLabel = direction === "IN" ? "RECEIVED" : "SENT";
  const cpStr = counterparty
    ? `\n${direction === "IN" ? "From" : "To"}: <code>${counterparty.slice(0, 4)}...${counterparty.slice(-4)}</code>`
    : "";
  const shortAddr = walletAddress.slice(0, 4) + "..." + walletAddress.slice(-4);
  const shortSig = signature.slice(0, 8) + "..." + signature.slice(-8);

  return (
    `${emoji} <b>TOKEN ${dirLabel}</b>\n` +
    `👤 <b>${walletLabel}</b> (<code>${shortAddr}</code>)${cpStr}\n` +
    `\n` +
    `<b>${amount} ${token}</b>${usdStr}\n` +
    `\n` +
    `🕐 ${time}\n` +
    `🔗 <a href="https://solscan.io/tx/${signature}">View on Solscan</a> | <code>${shortSig}</code>`
  );
}
