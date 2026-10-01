import type { PaymentRequired, PaymentRequirements } from "@x402/core/types";
import { getAddress, isAddressEqual } from "viem";
import { NETWORK, USDC_ADDRESS, USDC_NAME, USDC_VERSION } from "./constants.js";

export function validatePaymentRequired(
  required: PaymentRequired,
  expectedMerchant: string,
  maxAmountAtomic: bigint,
): PaymentRequirements {
  if (required.x402Version !== 2) throw new Error(`Refusing x402 version ${required.x402Version}`);
  if (!Array.isArray(required.accepts) || required.accepts.length !== 1) {
    throw new Error("Expected exactly one payment requirement");
  }
  const requirement = required.accepts[0];
  if (!requirement) throw new Error("Payment requirement is missing");
  const problems: string[] = [];
  if (requirement.scheme !== "exact") problems.push(`scheme ${requirement.scheme}`);
  if (requirement.network !== NETWORK) problems.push(`network ${requirement.network}`);
  try {
    if (!isAddressEqual(getAddress(requirement.asset), getAddress(USDC_ADDRESS))) {
      problems.push(`asset ${requirement.asset}`);
    }
  } catch {
    problems.push(`asset ${requirement.asset}`);
  }
  try {
    if (!isAddressEqual(getAddress(requirement.payTo), getAddress(expectedMerchant))) {
      problems.push(`payTo ${requirement.payTo}`);
    }
  } catch {
    problems.push(`payTo ${requirement.payTo}`);
  }
  if (typeof requirement.amount !== "string" || !/^[1-9][0-9]*$/.test(requirement.amount)) {
    problems.push(`invalid amount ${String(requirement.amount)}`);
  } else if (BigInt(requirement.amount) > maxAmountAtomic) {
    problems.push(`amount ${requirement.amount} exceeds cap ${maxAmountAtomic}`);
  }
  if (!Number.isSafeInteger(requirement.maxTimeoutSeconds) || requirement.maxTimeoutSeconds <= 0) {
    problems.push(`invalid maxTimeoutSeconds ${requirement.maxTimeoutSeconds}`);
  }
  if (requirement.extra?.name !== USDC_NAME || requirement.extra?.version !== USDC_VERSION) {
    problems.push("unexpected USDC EIP-712 domain");
  }
  if (requirement.extra?.assetTransferMethod !== undefined && requirement.extra.assetTransferMethod !== "eip3009") {
    problems.push(`assetTransferMethod ${String(requirement.extra.assetTransferMethod)}`);
  }
  if (problems.length) throw new Error(`Refusing to pay: ${problems.join("; ")}`);
  return requirement;
}

