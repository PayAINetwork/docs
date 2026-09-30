import { createApp } from "./app.js";
import { requiredEnv } from "./config.js";

const port = Number(process.env.PORT ?? "3000");
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error("PORT is invalid");
const host = process.env.HOST?.trim() || "127.0.0.1";
createApp(requiredEnv("MERCHANT_ADDRESS"), undefined, process.env.PUBLIC_RESOURCE_URL?.trim() || undefined).listen(port, host, () => {
  console.log(`Solana Mainnet x402 example listening on http://${host}:${port}`);
});
