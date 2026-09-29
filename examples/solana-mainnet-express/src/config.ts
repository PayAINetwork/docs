export function requiredEnv(name: string, env: NodeJS.ProcessEnv = process.env): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function positiveAtomic(value: string, name: string): bigint {
  if (!/^[1-9][0-9]*$/.test(value)) throw new Error(`${name} must be a positive integer`);
  return BigInt(value);
}

export interface SmokeConfig {
  buyerKeypairFile: string;
  guardFile: string;
  maxAmountAtomic: bigint;
  merchantAddress: string;
  premiumUrl: string;
  rpcUrl: string;
}

export function loadSmokeConfig(env: NodeJS.ProcessEnv = process.env): SmokeConfig {
  return {
    buyerKeypairFile: requiredEnv("BUYER_KEYPAIR_FILE", env),
    guardFile: env.PAYMENT_ATTEMPT_FILE?.trim() || "payment-attempt.json",
    maxAmountAtomic: positiveAtomic(requiredEnv("MAX_AMOUNT_ATOMIC", env), "MAX_AMOUNT_ATOMIC"),
    merchantAddress: requiredEnv("MERCHANT_ADDRESS", env),
    premiumUrl: env.PREMIUM_URL?.trim() || "http://127.0.0.1:3000/premium",
    rpcUrl: requiredEnv("SOLANA_RPC_URL", env),
  };
}
