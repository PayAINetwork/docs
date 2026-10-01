import {
  createPublicClient,
  decodeEventLog,
  getAddress,
  http,
  isAddressEqual,
  parseAbi,
  parseAbiItem,
  type Address,
  type Hex,
  type TransactionReceipt,
} from "viem";
import { base } from "viem/chains";
import { CHAIN_ID, USDC_ADDRESS } from "./constants.js";

const USDC_ABI = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce)",
]);
const AUTHORIZATION_USED_EVENT = parseAbiItem(
  "event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce)",
);

export interface Authorization {
  from: Address;
  to: Address;
  value: string;
  validAfter: string;
  validBefore: string;
  nonce: Hex;
}

export interface BaseChainClient {
  getChainId(): Promise<number>;
  getBytecode(args: { address: Address }): Promise<Hex | undefined>;
  readContract(args: Record<string, unknown>): Promise<unknown>;
  getBlockNumber(): Promise<bigint>;
  getBlock(args: { blockTag: "finalized" } | { blockNumber: bigint }): Promise<{
    number: bigint | null;
    hash?: Hex | null;
  }>;
  waitForTransactionReceipt(args: {
    hash: Hex;
    confirmations: number;
    timeout: number;
  }): Promise<TransactionReceipt>;
  getTransactionReceipt(args: { hash: Hex }): Promise<TransactionReceipt>;
  getLogs(args: Record<string, unknown>): Promise<Array<{ transactionHash: Hex | null }>>;
}

export function createBaseClient(rpcUrl: string): BaseChainClient {
  return createPublicClient({ chain: base, transport: http(rpcUrl) }) as unknown as BaseChainClient;
}

export async function assertBaseMainnet(client: BaseChainClient): Promise<void> {
  const chainId = await client.getChainId();
  if (chainId !== CHAIN_ID) throw new Error(`BASE_RPC_URL is not Base Mainnet: expected chain ID ${CHAIN_ID}, got ${chainId}`);
  const code = await client.getBytecode({ address: getAddress(USDC_ADDRESS) });
  if (!code || code === "0x") throw new Error(`Base Mainnet USDC contract ${USDC_ADDRESS} has no bytecode`);
}

export async function readUsdcBalance(
  client: BaseChainClient,
  owner: string,
  blockNumber?: bigint,
): Promise<bigint> {
  const value = await client.readContract({
    address: getAddress(USDC_ADDRESS),
    abi: USDC_ABI,
    functionName: "balanceOf",
    args: [getAddress(owner)],
    ...(blockNumber === undefined ? {} : { blockNumber }),
  });
  if (typeof value !== "bigint") throw new Error("USDC balanceOf returned a non-integer value");
  return value;
}

export function assertAuthorization(
  authorization: Authorization,
  payer: string,
  merchant: string,
  amountAtomic: bigint,
): void {
  if (!isAddressEqual(getAddress(authorization.from), getAddress(payer))) {
    throw new Error(`Authorization payer ${authorization.from} does not match ${payer}`);
  }
  if (!isAddressEqual(getAddress(authorization.to), getAddress(merchant))) {
    throw new Error(`Authorization recipient ${authorization.to} does not match ${merchant}`);
  }
  if (!/^[0-9]+$/.test(authorization.value) || BigInt(authorization.value) !== amountAtomic) {
    throw new Error(`Authorization amount ${authorization.value} does not match ${amountAtomic}`);
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(authorization.nonce)) throw new Error("Authorization nonce is invalid");
}

export function verifySettlementReceipt(
  receipt: TransactionReceipt,
  authorization: Authorization,
): void {
  if (receipt.status !== "success") throw new Error(`Settlement transaction ${receipt.transactionHash} reverted`);
  let transferMatches = 0;
  let authorizationMatches = 0;
  for (const log of receipt.logs) {
    if (!isAddressEqual(getAddress(log.address), getAddress(USDC_ADDRESS))) continue;
    try {
      const decoded = decodeEventLog({ abi: USDC_ABI, data: log.data, topics: log.topics });
      if (decoded.eventName === "Transfer") {
        const args = decoded.args as { from: Address; to: Address; value: bigint };
        if (
          isAddressEqual(args.from, authorization.from) &&
          isAddressEqual(args.to, authorization.to) &&
          args.value === BigInt(authorization.value)
        ) {
          transferMatches += 1;
        }
      } else if (decoded.eventName === "AuthorizationUsed") {
        const args = decoded.args as { authorizer: Address; nonce: Hex };
        if (
          isAddressEqual(args.authorizer, authorization.from) &&
          args.nonce.toLowerCase() === authorization.nonce.toLowerCase()
        ) {
          authorizationMatches += 1;
        }
      }
    } catch {
      // Other USDC events are irrelevant to this authorization.
    }
  }
  if (transferMatches !== 1) {
    throw new Error(`Settlement receipt has ${transferMatches} exact USDC Transfer matches, expected 1`);
  }
  if (authorizationMatches !== 1) {
    throw new Error(`Settlement receipt has ${authorizationMatches} AuthorizationUsed matches, expected 1`);
  }
}

export async function waitForFinalizedReceipt(
  client: BaseChainClient,
  transactionHash: Hex,
  attempts = 180,
  delayMs = 2_000,
): Promise<TransactionReceipt> {
  const initialReceipt = await client.waitForTransactionReceipt({
    hash: transactionHash,
    confirmations: 1,
    timeout: 180_000,
  });
  for (let attempt = 0; attempt < attempts; attempt++) {
    const finalized = await client.getBlock({ blockTag: "finalized" });
    if (finalized.number !== null && finalized.number >= initialReceipt.blockNumber) {
      const receipt = await client.getTransactionReceipt({ hash: transactionHash });
      if (receipt.transactionHash.toLowerCase() !== transactionHash.toLowerCase()) {
        throw new Error(`RPC returned a receipt for the wrong transaction: ${receipt.transactionHash}`);
      }
      if (receipt.status !== "success") {
        throw new Error(`Settlement transaction ${transactionHash} reverted`);
      }
      if (receipt.blockNumber <= finalized.number) {
        const canonicalBlock = await client.getBlock({ blockNumber: receipt.blockNumber });
        const canonicalHash = canonicalBlock.hash;
        if (!canonicalHash || /^0x0{64}$/i.test(canonicalHash)) {
          throw new Error(`RPC could not prove the canonical hash for finalized block ${receipt.blockNumber}`);
        }
        if (canonicalHash.toLowerCase() !== receipt.blockHash.toLowerCase()) {
          throw new Error(`Settlement transaction ${transactionHash} is not in the canonical finalized block`);
        }
        return receipt;
      }
    }
    if (attempt + 1 < attempts && delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  throw new Error(`Transaction ${transactionHash} has not reached Base's finalized block tag`);
}

export async function findFinalizedAuthorizationTransaction(
  client: BaseChainClient,
  fromBlock: bigint,
  endBlock: bigint,
  authorization: Authorization,
): Promise<Hex | null> {
  if (endBlock < fromBlock) throw new Error("Reconciliation end block precedes its start block");
  const finalized = await client.getBlock({ blockTag: "finalized" });
  if (finalized.number === null || finalized.number < fromBlock) return null;
  const toBlock = finalized.number < endBlock ? finalized.number : endBlock;
  const logs = await client.getLogs({
    address: getAddress(USDC_ADDRESS),
    event: AUTHORIZATION_USED_EVENT,
    args: { authorizer: authorization.from, nonce: authorization.nonce },
    fromBlock,
    toBlock,
  });
  const hashes = [...new Set(logs.map(log => log.transactionHash).filter((hash): hash is Hex => hash !== null))];
  if (hashes.length > 1) throw new Error("Authorization nonce appeared in more than one finalized transaction");
  return hashes[0] ?? null;
}
