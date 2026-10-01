import express from "express";
import { facilitator } from "@payai/facilitator";
import { HTTPFacilitatorClient, type FacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { getAddress } from "viem";
import {
  FACILITATOR_URL,
  NETWORK,
  PRICE_ATOMIC,
  USDC_ADDRESS,
  USDC_NAME,
  USDC_VERSION,
} from "./constants.js";

if (facilitator.url !== FACILITATOR_URL) {
  throw new Error("@payai/facilitator URL does not match integration.json");
}

export function createApp(
  merchantAddress: string,
  facilitatorClient: FacilitatorClient = new HTTPFacilitatorClient(facilitator),
  publicResourceUrl?: string,
): express.Express {
  const merchant = getAddress(merchantAddress);
  if (publicResourceUrl !== undefined) {
    const url = new URL(publicResourceUrl);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/premium" ||
      url.search ||
      url.hash
    ) {
      throw new Error("PUBLIC_RESOURCE_URL must be an HTTPS /premium URL without credentials, query or fragment");
    }
  }
  const app = express();
  app.set("case sensitive routing", true);
  app.set("strict routing", true);

  app.use((request, response, next) => {
    let decodedPath = request.path;
    try {
      decodedPath = decodeURIComponent(decodedPath);
    } catch {
      // Leave malformed escapes unmatched so Express returns its normal 404.
    }
    const normalizedPath = decodedPath
      .replace(/\/+/g, "/")
      .replace(/\/+$/, "")
      .toLowerCase();
    if (normalizedPath !== "/premium") return next();
    if (request.path !== "/premium") {
      response.status(404).end();
      return;
    }
    if (request.method !== "GET") {
      response.status(405).set("Allow", "GET").end();
      return;
    }
    next();
  });

  const resourceServer = new x402ResourceServer(facilitatorClient).register(
    NETWORK,
    new ExactEvmScheme(),
  );

  app.get("/health", (_request, response) => response.json({ ok: true }));
  app.use(
    paymentMiddleware(
      {
        "GET /premium": {
          accepts: {
            scheme: "exact",
            network: NETWORK,
            payTo: merchant,
            price: {
              amount: PRICE_ATOMIC,
              asset: USDC_ADDRESS,
              extra: { name: USDC_NAME, version: USDC_VERSION },
            },
            maxTimeoutSeconds: 60,
          },
          description: "Premium Base Mainnet content",
          ...(publicResourceUrl ? { resource: publicResourceUrl } : {}),
          mimeType: "application/json",
        },
      },
      resourceServer,
    ),
  );
  app.get("/premium", (_request, response) => response.json({ content: "premium content" }));
  return app;
}
