import type { PaymentRequired, PaymentRequirements } from "@x402/core/types";
import { NETWORK, USDC_MINT } from "./constants.js";

export function validatePaymentRequired(
  required: PaymentRequired,
  expectedMerchant: string,
  maxAmountAtomic: bigint,
  expectedFeePayer: string,
): PaymentRequirements {
  if (required.x402Version !== 2) throw new Error(`Refusing x402 version ${required.x402Version}`);
  if (!Array.isArray(required.accepts) || required.accepts.length !== 1) throw new Error("Expected exactly one payment requirement");
  const requirement = required.accepts[0];
  if (!requirement) throw new Error("Payment requirement is missing");
  const problems: string[] = [];
  if (requirement.scheme !== "exact") problems.push(`scheme ${requirement.scheme}`);
  if (requirement.network !== NETWORK) problems.push(`network ${requirement.network}`);
  if (requirement.asset !== USDC_MINT) problems.push(`asset ${requirement.asset}`);
  if (requirement.payTo !== expectedMerchant) problems.push(`payTo ${requirement.payTo}`);
  if (typeof requirement.amount !== "string" || !/^[1-9][0-9]*$/.test(requirement.amount)) problems.push(`invalid amount ${String(requirement.amount)}`);
  else if (BigInt(requirement.amount) > maxAmountAtomic) {
    problems.push(`amount ${requirement.amount} exceeds cap ${maxAmountAtomic}`);
  }
  if (!Number.isSafeInteger(requirement.maxTimeoutSeconds) || requirement.maxTimeoutSeconds <= 0) {
    problems.push(`invalid maxTimeoutSeconds ${requirement.maxTimeoutSeconds}`);
  }
  if (requirement.extra === null || typeof requirement.extra !== "object" || requirement.extra.feePayer !== expectedFeePayer) {
    problems.push(`feePayer ${String(requirement.extra?.feePayer)}`);
  }
  if (problems.length) throw new Error(`Refusing to pay: ${problems.join("; ")}`);
  return requirement;
}
