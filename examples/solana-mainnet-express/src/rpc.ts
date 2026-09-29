import { createHash } from "node:crypto";
import { findAssociatedTokenPda } from "@solana-program/token";
import { address, getTransactionDecoder, type Address } from "@solana/kit";
import type { SupportedResponse } from "@x402/core/types";
import { GENESIS_HASH, NETWORK, TOKEN_PROGRAM, USDC_MINT } from "./constants.js";

export type Fetch = typeof fetch;

export async function rpcCall<T>(rpcUrl: string, method: string, params: unknown[], fetchImpl: Fetch = fetch): Promise<T> {
  return (await rpcCallWithEvidence<T>(rpcUrl, method, params, fetchImpl)).result;
}

async function rpcCallWithEvidence<T>(rpcUrl: string, method: string, params: unknown[], fetchImpl: Fetch = fetch): Promise<{
  result: T;
  evidence: { receivedAt: string; bodyBase64: string; bodySha256: string };
}> {
  const response = await fetchImpl(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!response.ok) throw new Error(`${method} HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const body = JSON.parse(Buffer.from(bytes).toString("utf8")) as { result?: T; error?: unknown };
  if (body.error !== undefined) throw new Error(`${method}: ${JSON.stringify(body.error)}`);
  if (!("result" in body)) throw new Error(`${method}: missing result`);
  return {
    result: body.result as T,
    evidence: {
      receivedAt: new Date().toISOString(),
      bodyBase64: Buffer.from(bytes).toString("base64"),
      bodySha256: createHash("sha256").update(bytes).digest("hex"),
    },
  };
}

export async function assertSolanaMainnetRpc(rpcUrl: string, fetchImpl: Fetch = fetch): Promise<void> {
  const actual = await rpcCall<string>(rpcUrl, "getGenesisHash", [], fetchImpl);
  if (actual !== GENESIS_HASH) {
    throw new Error(`SOLANA_RPC_URL is not Solana Mainnet: expected full genesis hash ${GENESIS_HASH}, got ${actual}`);
  }
}

export function selectFeePayer(supported: SupportedResponse): string {
  const kind = supported.kinds.find(
    candidate => candidate.x402Version === 2 && candidate.scheme === "exact" && candidate.network === NETWORK,
  );
  const feePayer = kind?.extra?.feePayer;
  if (typeof feePayer !== "string") throw new Error(`Facilitator /supported has no fee payer for exact ${NETWORK}`);
  address(feePayer);
  return feePayer;
}

interface ParsedTokenAccount {
  owner: string;
  data: { parsed?: { info?: { mint?: string; owner?: string; tokenAmount?: { amount?: string } } } };
}

export interface TokenBalance {
  ata: string;
  amountAtomic: bigint;
  owner: string;
}

export async function getUsdcAta(owner: string): Promise<Address> {
  const [ata] = await findAssociatedTokenPda({
    mint: address(USDC_MINT),
    owner: address(owner),
    tokenProgram: address(TOKEN_PROGRAM),
  });
  return ata;
}

export async function readUsdcAta(
  rpcUrl: string,
  owner: string,
  fetchImpl: Fetch = fetch,
): Promise<TokenBalance | null> {
  const ata = await getUsdcAta(owner);
  const result = await rpcCall<{ value: ParsedTokenAccount | null }>(
    rpcUrl,
    "getAccountInfo",
    [ata, { encoding: "jsonParsed", commitment: "finalized" }],
    fetchImpl,
  );
  if (!result.value) return null;
  const info = result.value.data.parsed?.info;
  if (
    result.value.owner !== TOKEN_PROGRAM ||
    info?.mint !== USDC_MINT ||
    info.owner !== owner ||
    !/^[0-9]+$/.test(info.tokenAmount?.amount ?? "")
  ) {
    throw new Error(`Unexpected USDC associated token account data for ${ata}`);
  }
  return { ata, amountAtomic: BigInt(info.tokenAmount!.amount!), owner };
}

export async function requireMerchantAta(rpcUrl: string, merchant: string, fetchImpl: Fetch = fetch): Promise<TokenBalance> {
  const account = await readUsdcAta(rpcUrl, merchant, fetchImpl);
  if (!account) {
    const ata = await getUsdcAta(merchant);
    throw new Error(
      `Merchant USDC ATA ${ata} is missing. Create it idempotently with a separate setup fee payer before payment; setup rent is not facilitator-sponsored settlement gas.`,
    );
  }
  return account;
}

export function transactionMessageFingerprint(base64Transaction: string): string {
  const transaction = getTransactionDecoder().decode(Buffer.from(base64Transaction, "base64"));
  return createHash("sha256").update(new Uint8Array(transaction.messageBytes)).digest("hex");
}

interface SignatureInfo { signature: string; blockTime: number | null; err: unknown }

export async function reconcileMessageFingerprint(
  rpcUrl: string,
  merchantAta: string,
  fingerprint: string,
  startedAt: string,
  fetchImpl: Fetch = fetch,
  fingerprintTransaction: (base64Transaction: string) => string = transactionMessageFingerprint,
): Promise<string | null> {
  const earliest = Date.parse(startedAt) - 120_000;
  const signatures = await rpcCall<SignatureInfo[]>(
    rpcUrl,
    "getSignaturesForAddress",
    [merchantAta, { limit: 100, commitment: "finalized" }],
    fetchImpl,
  );
  for (const candidate of signatures) {
    if (candidate.err !== null || (candidate.blockTime !== null && candidate.blockTime * 1000 < earliest)) continue;
    const transaction = await rpcCall<{ transaction: [string, "base64"] } | null>(
      rpcUrl,
      "getTransaction",
      [candidate.signature, { encoding: "base64", commitment: "finalized", maxSupportedTransactionVersion: 0 }],
      fetchImpl,
    );
    if (transaction && fingerprintTransaction(transaction.transaction[0]) === fingerprint) return candidate.signature;
  }
  return null;
}

export interface FinalizedTransactionEvidence {
  slot: number;
  blockTime: number;
  fee: number;
  messageFingerprint: string;
  tokenBalances: Array<{ owner?: string; mint: string; pre: bigint; post: bigint }>;
  transactionRpcEvidence: { receivedAt: string; bodyBase64: string; bodySha256: string };
}

export async function waitForFinalization(
  rpcUrl: string,
  signature: string,
  fetchImpl: Fetch = fetch,
  attempts = 90,
  delayMs = 2_000,
): Promise<FinalizedTransactionEvidence> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const statuses = await rpcCall<{ value: Array<{ confirmationStatus?: string; err: unknown } | null> }>(
      rpcUrl,
      "getSignatureStatuses",
      [[signature], { searchTransactionHistory: true }],
      fetchImpl,
    );
    const status = statuses.value[0];
    if (status?.err !== null && status?.err !== undefined) throw new Error(`Settlement transaction failed: ${JSON.stringify(status.err)}`);
    if (status?.confirmationStatus === "finalized") {
      const transactionResult = await rpcCallWithEvidence<{
        slot: number;
        blockTime: number | null;
        transaction: [string, "base64"];
        meta: {
          fee: number;
          err: unknown;
          preTokenBalances?: Array<{ accountIndex: number; mint: string; owner?: string; uiTokenAmount: { amount: string } }>;
          postTokenBalances?: Array<{ accountIndex: number; mint: string; owner?: string; uiTokenAmount: { amount: string } }>;
        };
      } | null>(
        rpcUrl,
        "getTransaction",
        [signature, { encoding: "base64", commitment: "finalized", maxSupportedTransactionVersion: 0 }],
        fetchImpl,
      );
      const transaction = transactionResult.result;
      if (!transaction || transaction.blockTime === null) throw new Error("Finalized transaction details are unavailable");
      if (transaction.meta.err !== null) throw new Error(`Finalized transaction failed: ${JSON.stringify(transaction.meta.err)}`);
      const preByAccount = new Map((transaction.meta.preTokenBalances ?? []).map(balance => [balance.accountIndex, balance]));
      const tokenBalances: Array<{ owner?: string; mint: string; pre: bigint; post: bigint }> = [];
      for (const balance of transaction.meta.postTokenBalances ?? []) {
        const pre = preByAccount.get(balance.accountIndex);
        if (!pre) continue;
        tokenBalances.push({
          owner: balance.owner ?? pre.owner,
          mint: balance.mint,
          pre: BigInt(pre.uiTokenAmount.amount),
          post: BigInt(balance.uiTokenAmount.amount),
        });
      }
      return {
        slot: transaction.slot,
        blockTime: transaction.blockTime,
        fee: transaction.meta.fee,
        messageFingerprint: transactionMessageFingerprint(transaction.transaction[0]),
        tokenBalances,
        transactionRpcEvidence: transactionResult.evidence,
      };
    }
    if (attempt + 1 < attempts && delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  throw new Error(`Transaction ${signature} did not reach finalized commitment`);
}
