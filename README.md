# Solana Wallet Tracker

Real-time Solana wallet monitoring → Telegram alerts.  
Tracks **DEX swaps** (Jupiter, Raydium, Orca) and **SPL token transfers**.

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
```

Edit `.env`:

| Variable | Description |
|---|---|
| `HELIUS_API_KEY` | Get at [helius.xyz](https://helius.xyz) — free tier works |
| `TELEGRAM_BOT_TOKEN` | Create a bot via [@BotFather](https://t.me/BotFather) |
| `TELEGRAM_CHAT_ID` | Get from [@userinfobot](https://t.me/userinfobot) |
| `WALLETS` | `ADDRESS:LABEL` comma-separated, e.g. `7xKX...:Whale1,9WzD...:MyWallet` |
| `MIN_USD_VALUE` | Minimum USD value to alert (default `0`) |

### 3. Run
```bash
# Development (ts-node)
npm run dev

# Production (compiled)
npm run build && npm start
```

## Alert Format

**Swap:**
```
🔄 DEX SWAP on Jupiter
👤 Whale1 (7xKX...sAsU)

100 USDC → 0.612 SOL (~$100)

🕐 Mon, 08 Jun 2026 14:00:00 UTC
🔗 View on Solscan
```

**Transfer:**
```
📥 TOKEN RECEIVED
👤 MyWallet (9WzD...WM)
From: 4xAB...cD12

500.00 USDC (~$500)

🕐 Mon, 08 Jun 2026 14:00:00 UTC
🔗 View on Solscan
```

## Architecture

```
Helius WSS (logsSubscribe per wallet)
        ↓
  Signature detected
        ↓ (2s delay for indexing)
  Helius Enhanced TX API
        ↓
  Parser: swap vs transfer detection
        ↓
  Telegram alert
```

Each wallet gets its own persistent WebSocket connection with auto-reconnect.

## Running as a service (PM2)
```bash
npm install -g pm2
npm run build
pm2 start dist/index.js --name sol-tracker
pm2 save
pm2 startup
```
