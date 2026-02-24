# PayAI Documentation — Skills for Agents

Agents can use this file to find documentation by capability. All paths are relative to the docs site root.

## Understanding x402

- **What is x402**: [x402 introduction](/x402/introduction) — overview, benefits, architecture
- **Quickstart**: [x402 quickstart](/x402/quickstart) — high-level getting started
- **Protocol details**: [x402 reference](/x402/reference) — headers (PAYMENT-REQUIRED, PAYMENT-SIGNATURE, PAYMENT-RESPONSE), payload shapes, verification, settlement

## Implementing x402 without starter kits

- **Full manual flow in TypeScript**: [Entire x402 flow in TypeScript](/x402/manual-flow-typescript) — raw HTTP, handle 402, decode headers, sign and send payment, no SDK wrappers
- **Full manual flow in Python**: [Entire x402 flow in Python](/x402/manual-flow-python) — raw HTTP, handle 402, decode headers, sign and send payment, no SDK wrappers

## Accepting payments (merchants)

- **Server quickstarts**: [Merchant introduction](/x402/servers/introduction) — index of server frameworks
- **TypeScript**: [Express](/x402/servers/typescript/express), [Hono](/x402/servers/typescript/hono), [Next.js](/x402/servers/typescript/nextjs)
- **Python**: [FastAPI](/x402/servers/python/fastapi), [Flask](/x402/servers/python/flask)
- **Go**: [Gin](/x402/servers/go/gin)

## Making payments (clients)

- **Client quickstarts**: [Client introduction](/x402/clients/introduction) — index of client libraries
- **TypeScript**: [Axios](/x402/clients/typescript/axios), [Fetch](/x402/clients/typescript/fetch)
- **Python**: [httpx](/x402/clients/python/httpx), [requests](/x402/clients/python/requests)
- **Go**: [net/http](/x402/clients/go/http)

## Facilitators and networks

- **Using a facilitator**: [Facilitator introduction](/x402/facilitators/introduction)
- **Network IDs (CAIP-2)**: [Supported networks](/x402/supported-networks)
- **Pricing**: [Facilitator pricing](/x402/facilitators/pricing)

## Testing

- **Echo Merchant**: [Introduction](/x402-echo/introduction), [Getting started](/x402-echo/getting-started)

## Project and legal

- **PayAI intro**: [Introduction](/introduction)
- **Tokenomics, disclaimer, links, contributing**: [Project info](/project-info/contributing) (see nav for tokenomics, official-links, etc.)
