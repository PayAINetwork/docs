import express from "express";
import { facilitator } from "@payai/facilitator";
import { HTTPFacilitatorClient, type FacilitatorClient } from "@x402/core/server";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import { address } from "@solana/kit";
import { FACILITATOR_URL, NETWORK, PRICE_ATOMIC, USDC_DECIMALS, USDC_MINT } from "./constants.js";

if (facilitator.url !== FACILITATOR_URL) throw new Error("@payai/facilitator URL does not match integration.json");

export function createApp(
  merchantAddress: string,
  facilitatorClient: FacilitatorClient = new HTTPFacilitatorClient(facilitator),
): express.Express {
  address(merchantAddress);
  const app = express();
  const resourceServer = new x402ResourceServer(facilitatorClient).register(
    NETWORK,
    new ExactSvmScheme(),
  );

  app.get("/health", (_request, response) => response.json({ ok: true }));
  app.use(
    paymentMiddleware(
      {
        "GET /premium": {
          accepts: {
            scheme: "exact",
            network: NETWORK,
            payTo: merchantAddress,
            price: { amount: PRICE_ATOMIC, asset: USDC_MINT, extra: { decimals: USDC_DECIMALS } },
            maxTimeoutSeconds: 60,
          },
          description: "Premium Solana Mainnet content",
          mimeType: "application/json",
        },
      },
      resourceServer,
    ),
  );
  app.get("/premium", (_request, response) => response.json({ content: "premium content" }));
  return app;
}
