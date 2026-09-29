import { randomUUID } from "node:crypto";
import { open, readFile, rename } from "node:fs/promises";
import { dirname } from "node:path";
import { NETWORK, USDC_MINT } from "./constants.js";

export interface AttemptRecord {
  schemaVersion: 1;
  attemptId: string;
  state: "authorized" | "submitting" | "uncertain" | "failed" | "finalizing" | "finalized";
  startedAt: string;
  updatedAt: string;
  binding: {
    url: string;
    network: string;
    asset: string;
    merchant: string;
    payer: string;
    amountAtomic: string;
  };
  [key: string]: unknown;
}

async function syncParentDirectory(file: string): Promise<void> {
  const directory = await open(dirname(file), "r");
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

export async function createAttemptGuard(
  file: string,
  binding: { url: string; merchant: string; payer: string; amountAtomic: string },
): Promise<AttemptRecord> {
  const now = new Date().toISOString();
  const record: AttemptRecord = {
    schemaVersion: 1,
    attemptId: randomUUID(),
    state: "authorized",
    startedAt: now,
    updatedAt: now,
    binding: { ...binding, network: NETWORK, asset: USDC_MINT },
  };
  try {
    const handle = await open(file, "wx", 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(record, null, 2)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await syncParentDirectory(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(`Payment attempt guard ${file} already exists; reconcile or recover it, never start another payment`);
    }
    throw error;
  }
  return record;
}

export async function readAttempt(file: string): Promise<AttemptRecord> {
  return JSON.parse(await readFile(file, "utf8")) as AttemptRecord;
}

export async function updateAttempt(file: string, record: AttemptRecord, patch: Record<string, unknown>): Promise<AttemptRecord> {
  const current = await readAttempt(file);
  if (current.attemptId !== record.attemptId) throw new Error("Payment attempt guard changed unexpectedly");
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() } as AttemptRecord;
  const temporary = `${file}.tmp-${process.pid}-${randomUUID()}`;
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(next, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, file);
  await syncParentDirectory(file);
  return next;
}
