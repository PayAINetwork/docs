import integration from "../integration.json" with { type: "json" };

export { integration };
export const NETWORK = integration.network.x402 as `${string}:${string}`;
export const GENESIS_HASH = integration.network.rpcGenesisHash;
export const USDC_MINT = integration.asset.mint;
export const TOKEN_PROGRAM = integration.asset.tokenProgram;
export const USDC_DECIMALS = integration.asset.decimals;
export const FACILITATOR_URL = integration.facilitator.url;
export const PRICE_ATOMIC = "1000";
