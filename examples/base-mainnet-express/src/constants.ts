import integration from "../integration.json" with { type: "json" };

export { integration };
export const NETWORK = integration.network.x402 as `eip155:${number}`;
export const CHAIN_ID = integration.network.chainId;
export const USDC_ADDRESS = integration.asset.address as `0x${string}`;
export const USDC_DECIMALS = integration.asset.decimals;
export const USDC_NAME = integration.asset.eip712Name;
export const USDC_VERSION = integration.asset.eip712Version;
export const FACILITATOR_URL = integration.facilitator.url;
export const PRICE_ATOMIC = "10000";

