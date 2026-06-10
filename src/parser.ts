import axios from "axios";
import { config } from "./config";
import { sendAlert, formatSwapAlert, formatTransferAlert } from "./telegram";

// Known DEX program IDs
const DEX_PROGRAMS: Record<string, string> = {
  JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4: "Jupiter",
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8": "Raydium",
  whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc: "Orca",
  "9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP": "Orca v2",
  srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX: "Serum",
  DjVE6JNiYqPL2QXyCUUh8rNjHrbz9hXHNYt99MQ59qw1: "Aldrin",
  AMM55ShdkoioZB5LZKcdznGKMnHgrPCBRsaqxoye3b5J: "Meteora",
};

export interface ParsedEvent {
  type: "SWAP" | "TRANSFER";
  signature: string;
  timestamp: number;
  walletAddress: string;

  // Swap
  fromToken?: string;
  toToken?: string;
  fromAmount?: string;
  toAmount?: string;
  dex?: string;

  // Transfer
  direction?: "IN" | "OUT";
  token?: string;
  amount?: string;
  counterparty?: string;

  usdValue?: number;
}

interface HeliusTokenTransfer {
  fromUserAccount: string;
  toUserAccount: string;
  fromTokenAccount: string;
  toTokenAccount: string;
  tokenAmount: number;
  decimals: number;
  tokenStandard: string;
  mint: string;
}

interface HeliusNativeTransfer {
  fromUserAccount: string;
  toUserAccount: string;
  amount: number;
}

interface HeliusTransaction {
  signature: string;
  timestamp: number;
  type: string;
  source: string;
  tokenTransfers: HeliusTokenTransfer[];
  nativeTransfers: HeliusNativeTransfer[];
  accountData: Array<{ account: string; nativeBalanceChange: number; tokenBalanceChanges: unknown[] }>;
  instructions: Array<{ programId: string; accounts: string[]; data: string; innerInstructions: unknown[] }>;
  events?: {
    swap?: {
      nativeInput?: { account: string; amount: string };
      nativeOutput?: { account: string; amount: string };
      tokenInputs?: Array<{ userAccount: string; tokenAccount: string; rawTokenAmount: { tokenAmount: string; decimals: number }; mint: string }>;
      tokenOutputs?: Array<{ userAccount: string; tokenAccount: string; rawTokenAmount: { tokenAmount: string; decimals: number }; mint: string }>;
    };
  };
}

// Fetch enhanced transaction details from Helius
export async function fetchEnhancedTx(signature: string): Promise<HeliusTransaction | null> {
  try {
    const res = await axios.post(
      config.heliusEnhancedUrl,
      { transactions: [signature] },
      { timeout: 10000 }
    );
    const txs: HeliusTransaction[] = res.data;
    return txs?.[0] ?? null;
  } catch (err) {
    console.error(`[Parser] Failed to fetch tx ${signature}:`, err);
    return null;
  }
}

function detectDex(tx: HeliusTransaction): string | undefined {
  for (const ix of tx.instructions) {
    if (DEX_PROGRAMS[ix.programId]) return DEX_PROGRAMS[ix.programId];
    const inner = (ix.innerInstructions as Array<{ programId: string }>) || [];
    for (const innerIx of inner) {
      if (DEX_PROGRAMS[innerIx.programId]) return DEX_PROGRAMS[innerIx.programId];
    }
  }
  return tx.source && DEX_PROGRAMS[tx.source] ? DEX_PROGRAMS[tx.source] : undefined;
}

function formatAmount(amount: number, decimals: number): string {
  return (amount / Math.pow(10, decimals)).toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function mintLabel(mint: string): string {
  // Common mints
  const known: Record<string, string> = {
    So11111111111111111111111111111111111111112: "SOL",
    EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: "USDC",
    Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: "USDT",
    mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So: "mSOL",
    "7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj": "stSOL",
    DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263: "BONK",
    JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: "JUP",
    WENWENvqqNya429ubCdR81ZmD69brwQaaBYY6p3LCpk: "WEN",
  };
  return known[mint] || mint.slice(0, 4) + "..." + mint.slice(-4);
}

export async function parseAndAlert(signature: string, walletAddress: string, walletLabel: string): Promise<void> {
  const tx = await fetchEnhancedTx(signature);
  if (!tx) return;

  const events: ParsedEvent[] = [];

  // ── SWAP detection ──────────────────────────────────────────────
  const isSwap =
    tx.type === "SWAP" ||
    tx.source === "JUPITER" ||
    tx.source === "RAYDIUM" ||
    tx.source === "ORCA" ||
    !!tx.events?.swap ||
    !!detectDex(tx);

  if (isSwap && tx.events?.swap) {
    const swap = tx.events.swap;
    let fromToken = "SOL";
    let toToken = "SOL";
    let fromAmount = "0";
    let toAmount = "0";

    if (swap.tokenInputs?.length) {
      const ti = swap.tokenInputs[0];
      fromToken = mintLabel(ti.mint);
      fromAmount = formatAmount(parseFloat(ti.rawTokenAmount.tokenAmount), ti.rawTokenAmount.decimals);
    } else if (swap.nativeInput) {
      fromToken = "SOL";
      fromAmount = formatAmount(parseInt(swap.nativeInput.amount), 9);
    }

    if (swap.tokenOutputs?.length) {
      const to = swap.tokenOutputs[0];
      toToken = mintLabel(to.mint);
      toAmount = formatAmount(parseFloat(to.rawTokenAmount.tokenAmount), to.rawTokenAmount.decimals);
    } else if (swap.nativeOutput) {
      toToken = "SOL";
      toAmount = formatAmount(parseInt(swap.nativeOutput.amount), 9);
    }

    events.push({
      type: "SWAP",
      signature,
      timestamp: tx.timestamp,
      walletAddress,
      fromToken,
      toToken,
      fromAmount,
      toAmount,
      dex: detectDex(tx) || tx.source,
    });
  }

  // ── TOKEN TRANSFER detection (non-swap) ─────────────────────────
  if (!isSwap && tx.tokenTransfers?.length) {
    for (const transfer of tx.tokenTransfers) {
      const isIncoming = transfer.toUserAccount === walletAddress;
      const isOutgoing = transfer.fromUserAccount === walletAddress;
      if (!isIncoming && !isOutgoing) continue;

      events.push({
        type: "TRANSFER",
        signature,
        timestamp: tx.timestamp,
        walletAddress,
        direction: isIncoming ? "IN" : "OUT",
        token: mintLabel(transfer.mint),
        amount: formatAmount(transfer.tokenAmount, transfer.decimals),
        counterparty: isIncoming ? transfer.fromUserAccount : transfer.toUserAccount,
      });
    }
  }

  // ── Native SOL transfer fallback ────────────────────────────────
  if (!isSwap && !tx.tokenTransfers?.length && tx.nativeTransfers?.length) {
    for (const transfer of tx.nativeTransfers) {
      const isIncoming = transfer.toUserAccount === walletAddress;
      const isOutgoing = transfer.fromUserAccount === walletAddress;
      if (!isIncoming && !isOutgoing) continue;
      if (transfer.amount < 5000) continue; // skip dust / rent

      events.push({
        type: "TRANSFER",
        signature,
        timestamp: tx.timestamp,
        walletAddress,
        direction: isIncoming ? "IN" : "OUT",
        token: "SOL",
        amount: formatAmount(transfer.amount, 9),
        counterparty: isIncoming ? transfer.fromUserAccount : transfer.toUserAccount,
      });
    }
  }

  // ── Send alerts ─────────────────────────────────────────────────
  for (const event of events) {
    if (event.usdValue !== undefined && event.usdValue < config.minUsdValue) continue;

    if (event.type === "SWAP") {
      const msg = formatSwapAlert({
        walletLabel,
        walletAddress,
        signature: event.signature,
        fromToken: event.fromToken!,
        toToken: event.toToken!,
        fromAmount: event.fromAmount!,
        toAmount: event.toAmount!,
        usdValue: event.usdValue,
        dex: event.dex,
        timestamp: event.timestamp,
      });
      console.log(`[Alert] SWAP for ${walletLabel}: ${event.fromToken} → ${event.toToken}`);
      await sendAlert(msg);
    } else if (event.type === "TRANSFER") {
      const msg = formatTransferAlert({
        walletLabel,
        walletAddress,
        signature: event.signature,
        direction: event.direction!,
        token: event.token!,
        amount: event.amount!,
        usdValue: event.usdValue,
        counterparty: event.counterparty,
        timestamp: event.timestamp,
      });
      console.log(`[Alert] TRANSFER ${event.direction} for ${walletLabel}: ${event.amount} ${event.token}`);
      await sendAlert(msg);
    }
  }
}
