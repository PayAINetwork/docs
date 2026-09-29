import { readFile } from "node:fs/promises";
import { createKeyPairSignerFromBytes } from "@solana/kit";

export async function loadBuyerSigner(file: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read BUYER_KEYPAIR_FILE: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!Array.isArray(parsed) || parsed.length !== 64 || parsed.some(byte => !Number.isInteger(byte) || byte < 0 || byte > 255)) {
    throw new Error("BUYER_KEYPAIR_FILE must contain a JSON array of 64 bytes");
  }
  return createKeyPairSignerFromBytes(new Uint8Array(parsed as number[]));
}
