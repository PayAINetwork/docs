import { readFile, stat } from "node:fs/promises";
import { privateKeyToAccount } from "viem/accounts";

export async function loadBuyerAccount(file: string) {
  const metadata = await stat(file).catch(error => {
    throw new Error(`Cannot stat BUYER_KEY_FILE: ${error instanceof Error ? error.message : String(error)}`);
  });
  if (!metadata.isFile()) throw new Error("BUYER_KEY_FILE must be a regular file");
  if (process.platform !== "win32" && (metadata.mode & 0o077) !== 0) {
    throw new Error("BUYER_KEY_FILE must not be accessible by group or other users; run chmod 600");
  }
  const value = (await readFile(file, "utf8").catch(error => {
    throw new Error(`Cannot read BUYER_KEY_FILE: ${error instanceof Error ? error.message : String(error)}`);
  })).trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error("BUYER_KEY_FILE must contain one 0x-prefixed 32-byte EVM private key");
  }
  return privateKeyToAccount(value as `0x${string}`);
}

