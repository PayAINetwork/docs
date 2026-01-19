# PayAI Documentation Update Plan

This document outlines all the changes needed to update the PayAI documentation at https://docs.payai.network. The plan is organized into separate issues that can be tackled independently or in sequence.

**Reference Resources:**
- Upstream x402 repo: https://github.com/coinbase/x402
- V2 Specification: `/x402/specs/x402-specification-v2.md`
- V2 HTTP Transport: `/x402/specs/transports-v2/http.md`

---

## Issue 1: Remove Deprecated Products from Documentation

**Priority:** High  
**Estimated Effort:** Small  

### Description
Remove three deprecated products from the documentation: Freelance AI, CT Agent Monetization, and Token Gateway.

### Tasks

#### 1.1 Update `docs.json` Navigation
Remove the following groups from the navigation in `docs.json`:
- "Freelance AI" group (lines 92-99)
- "CT Agent Monetization" group (lines 100-105)
- "Token Gateway" group (lines 106-111)

#### 1.2 Update Landing Page (`introduction.mdx`)
Remove the following cards from `introduction.mdx`:
- "Freelance AI" card (lines 29-34)
- "CT Agent Monetization" card (lines 35-41)
- "Token Gateway" card (lines 42-48)

The remaining cards should be: x402, X402 Echo Merchant

#### 1.3 Delete Deprecated Files
Delete the following directories and files:
- `/docs/freelance-ai/` (entire directory)
- `/docs/ct-agent/` (entire directory)
- `/docs/token-gateway/` (entire directory)
- `/docs/images/freelance-ai/` (entire directory)
- `/docs/images/ct-agent/` (entire directory)
- `/docs/images/token-gateway/` (entire directory)

### Acceptance Criteria
- [ ] Navigation no longer shows Freelance AI, CT Agent, Token Gateway
- [ ] Landing page only shows x402 and Echo Merchant cards
- [ ] All deprecated files and images are removed
- [ ] No broken links remain

---

## Issue 2: Update x402 Merchant Introduction

**Priority:** High  
**Estimated Effort:** Medium  

### Description
Update the merchant introduction page with accurate information and add a code preview to hook developers.

### Tasks

#### 2.1 Update Benefits Section
In `x402/servers/introduction.mdx`, update the benefits list:

**Current:**
```
✅ Merchants don't pay network fees.  
✅ Customers don't pay network fees.  
```

**Updated:**
```
✅ Customers don't pay network fees.  
```

Remove the "Merchants don't pay network fees" line as this is changing soon.

#### 2.2 Fix Next.js Card Button
Update the Next.js card to remove "(coming soon)" since docs now exist:

**Current:**
```mdx
<Card title="NextJS (coming soon)" href="/x402/servers/typescript/nextjs" icon="server">
    NextJS server quickstart is coming soon.
</Card>
```

**Updated:**
```mdx
<Card title="Next.js" href="/x402/servers/typescript/nextjs" icon="server">
    Quickstart for building an x402-enabled server with Next.js.
</Card>
```

#### 2.3 Add Code Preview Before Getting Started
Add a code preview section between "Architecture at a glance" and "Getting started" that shows how easy it is to integrate x402:

```mdx
## It's this easy

Add x402 payments to your Express server with just a few lines:

<Tabs>
  <Tab title="Express">
```typescript
import { paymentMiddleware } from "x402-express";

app.use(
  paymentMiddleware(
    payTo,
    {
      "GET /weather": {
        price: "$0.001",
        network: "solana-devnet",
      },
    },
    { url: "https://facilitator.payai.network" },
  ),
);
```
  </Tab>
  <Tab title="Hono">
```typescript
import { paymentMiddleware } from "x402-hono";

app.use(
  paymentMiddleware(
    payTo,
    {
      "/weather": {
        price: "$0.001",
        network: "solana-devnet",
      },
    },
    { url: "https://facilitator.payai.network" },
  ),
);
```
  </Tab>
</Tabs>
```

### Acceptance Criteria
- [ ] "Merchants don't pay network fees" is removed from benefits
- [ ] Next.js card no longer says "coming soon"
- [ ] Code preview section is added showing Express/Hono examples
- [ ] Preview appears before the Getting Started section

---

## Issue 3: Update Hono Quickstart to Use Starter Template

**Priority:** Medium  
**Estimated Effort:** Small  

### Description
Update the Hono quickstart guide to use the starter template like Express and Next.js, providing a consistent experience.

### Tasks

#### 3.1 Restructure Hono Documentation
Rewrite `x402/servers/typescript/hono.mdx` to match the structure of Express:

**New Structure:**
1. Step 1: Create from starter template (`npx @payai/x402-hono-starter my-first-server`)
2. Step 2: Set environment variables
3. Step 3: Preview the server code
4. Step 4: Run the server
5. Step 5: Test the server

**Note:** Verify that `@payai/x402-hono-starter` exists. If not, either:
- set the page description to coming soon and create a TODO item to create the hono starter.

#### 3.2 Add Paywall Testing Option
In the "Test the server" section, mention the paywall testing option alongside fetch/axios:

```mdx
You can test payments by:
- Following the [fetch example](/x402/clients/typescript/fetch) or [axios example](/x402/clients/typescript/axios)
- Creating a paywall using `@x402/paywall` for EVM chains or `x402-solana-react` for Solana
```

### Acceptance Criteria
- [ ] Hono docs use starter template (if available)
- [ ] Documentation structure matches Express quickstart
- [ ] Paywall testing option is mentioned

---

## Issue 4: Update Next.js Quickstart

**Priority:** Medium  
**Estimated Effort:** Small  

### Description
Improve the Next.js quickstart with additional details and remove unnecessary environment variables.

### Tasks

#### 4.1 Remove CDP API Key from Environment Variables
In `x402/servers/typescript/nextjs.mdx`, remove the CDP API key references:

**Remove:**
```env
# required if using the Base mainnet facilitator
CDP_API_KEY_ID="Coinbase Developer Platform Key"
CDP_API_KEY_SECRET="Coinbase Developer Platform Key Secret"
```

#### 4.2 Add Middleware Preview Section
Add a new step between "Explore the generated app" and "Run the app" to preview the middleware:

```mdx
### Step 4: Preview the middleware

The payment middleware in `middleware.ts` protects your routes:

```typescript
import { paymentMiddleware } from "@x402/next";

export const middleware = paymentMiddleware(
  process.env.ADDRESS!,
  {
    "/api/premium/*": {
      price: "$0.001",
      network: process.env.NETWORK || "solana-devnet",
    },
    "/premium/*": {
      price: "$0.001", 
      network: process.env.NETWORK || "solana-devnet",
    },
  },
  { url: process.env.FACILITATOR_URL! },
);

export const config = {
  matcher: ["/api/premium/:path*", "/premium/:path*"],
};
```

Adjust pricing, networks, and protected paths to match your needs.
```

#### 4.3 Update Testing Section
Note that the Next.js starter includes a built-in paywall for testing:

```mdx
### Step 5: Test the server

The starter includes a built-in paywall at the home page. Navigate to `http://localhost:3000` to test payments directly.

You can also test programmatically by following the [fetch example](/x402/clients/typescript/fetch) or [axios example](/x402/clients/typescript/axios).
```

### Acceptance Criteria
- [ ] CDP API key references are removed
- [ ] Middleware preview section is added
- [ ] Testing section mentions built-in paywall
- [ ] Steps are renumbered correctly

---

## Issue 5: Update x402 Client Introduction

**Priority:** Medium  
**Estimated Effort:** Small  

### Description
Update the client introduction page to remove inaccurate information and add a code preview.

### Tasks

#### 5.1 Update Benefits Section
In `x402/clients/introduction.mdx`, remove "Merchants don't pay network fees" from the benefits list since this appears to be duplicated from merchants and isn't relevant to clients.

**Keep only:**
```
✅ Customers don't pay network fees.  
✅ Payment settles in < 1 second.  
✅ Universal compatibility -- if it speaks HTTP, it speaks x402.
```

#### 5.2 Add Code Preview Before Getting Started
Add a code preview section showing how simple client integration is:

```mdx
## It's this easy

Make x402 payments with just a few lines:

<Tabs>
  <Tab title="Fetch">
```typescript
import { wrapFetchWithPayment } from "x402-fetch";

const fetchWithPayment = wrapFetchWithPayment(fetch, account);

const response = await fetchWithPayment("https://api.example.com/premium");
```
  </Tab>
  <Tab title="Axios">
```typescript
import { withPaymentInterceptor } from "x402-axios";

const api = withPaymentInterceptor(axios.create({ baseURL }), account);

const response = await api.get("/premium");
```
  </Tab>
  <Tab title="Python">
```python
from x402.clients.httpx import x402HttpxClient

async with x402HttpxClient(account=account, base_url=base_url) as client:
    response = await client.get("/premium")
```
  </Tab>
</Tabs>
```

### Acceptance Criteria
- [ ] Benefits section is cleaned up
- [ ] Code preview section is added
- [ ] Preview appears before Getting Started section

---

## Issue 6: Fix Fetch Client Documentation Typo

**Priority:** Low  
**Estimated Effort:** Trivial  

### Description
Fix duplicate "Step 2" in the fetch client documentation.

### Tasks

#### 6.1 Remove Duplicate Step
In `x402/clients/typescript/fetch.mdx`, there are two "Step 2" entries:

**Lines 30-33 (to remove):**
```mdx
### Step 2: Preview the client code
```

Keep only the second "Step 2: Set your environment variables" and ensure proper step numbering:
1. Step 1: Create from starter template
2. Step 2: Set your environment variables
3. Step 3: Preview the client code
4. Step 4: Run the client
5. Step 5: Test the client

### Acceptance Criteria
- [ ] Only one Step 2 exists
- [ ] All steps are numbered sequentially

---

## Issue 7: Add x402 Reference Callout to All Quickstarts

**Priority:** Medium  
**Estimated Effort:** Small  

### Description
Add a consistent "x402 Reference" section to the bottom of all quickstart guides, right before the "Need help?" section.

### Tasks

#### 7.1 Add Reference Section to All Quickstarts
Add the following section to each file, right before `## Need help?`:

```mdx
## x402 reference

For a deeper dive into message shapes, headers, verification and settlement responses, see the [x402 Reference](/x402/reference).
```

**Files to update:**
- `x402/servers/typescript/express.mdx`
- `x402/servers/typescript/hono.mdx`
- `x402/servers/typescript/nextjs.mdx`
- `x402/servers/python/fastapi.mdx`
- `x402/servers/python/flask.mdx`
- `x402/clients/typescript/axios.mdx`
- `x402/clients/typescript/fetch.mdx`
- `x402/clients/python/httpx.mdx`
- `x402/clients/python/requests.mdx`

### Acceptance Criteria
- [ ] All 9 quickstart guides have the x402 reference section
- [ ] Section appears right before "Need help?"
- [ ] Link works correctly

---

## Issue 8: Update Client Test Instructions to Include Next.js

**Priority:** Low  
**Estimated Effort:** Trivial  

### Description
Update the "Test the client" section in client quickstarts to mention the Next.js server example.

### Tasks

#### 8.1 Update Test Instructions
In the following files, update the test section to include Next.js:

**Files:**
- `x402/clients/typescript/axios.mdx`
- `x402/clients/typescript/fetch.mdx`

**Current:**
```mdx
You can test your client against a local server by running the [express example](/x402/servers/typescript/express) or the [hono example](/x402/servers/typescript/hono).
```

**Updated:**
```mdx
You can test your client against a local server by running the [Express example](/x402/servers/typescript/express), [Hono example](/x402/servers/typescript/hono), or [Next.js example](/x402/servers/typescript/nextjs).
```

### Acceptance Criteria
- [ ] Both axios and fetch docs mention Next.js option
- [ ] Links are correct

---

## Issue 9: Fix Facilitator Introduction Broken Link

**Priority:** High  
**Estimated Effort:** Trivial  

### Description
Fix the broken link in the facilitator introduction that points to a non-existent page.

### Tasks

#### 9.1 Update Facilitator Link
In `x402/facilitators/introduction.mdx`, update the broken link:

**Current (line 48-54):**
```mdx
<Card
  title="Try an Existing Facilitator"
  icon="list"
  href="/x402/facilitators/list-of-facilitators"
>
  Ready to try an existing facilitator? Continue to the List of Facilitators.
</Card>
```

**Updated:**
```mdx
<Card
  title="Try the PayAI Facilitator"
  icon="bolt"
  href="https://facilitator.payai.network"
>
  Ready to start? Visit the PayAI Facilitator to get started.
</Card>
```

### Acceptance Criteria
- [ ] Link points to `https://facilitator.payai.network`
- [ ] Card title/description are updated appropriately

---

## Issue 10: Add Facilitator Pricing Section

**Priority:** Medium  
**Estimated Effort:** Small  

### Description
Add a pricing section to the facilitator documentation after the supported networks page.

### Tasks

#### 10.1 Create Pricing Page
Create a new file `x402/facilitators/pricing.mdx`:

```mdx
---
title: "Facilitator Pricing"
description: "PayAI Facilitator pricing tiers"
---

import DiscordHelpCard from "/snippets/discord-help-card.mdx";

## Pricing Tiers

The PayAI Facilitator offers three pricing tiers to accommodate different usage levels.

<CardGroup cols={3}>
  <Card title="Free" icon="gift">
    **$0/month**
    
    - 100,000 settlements/month
    - 4 requests/second
    - 480 burst requests/minute
    
    Perfect for development and testing.
  </Card>
  
  <Card title="Basic" icon="rocket">
    **$1,500 PAYAI**
    
    - 500,000 settlements/month
    - 10 requests/second
    - 1,200 burst requests/minute
    
    For growing applications.
  </Card>
  
  <Card title="Pro" icon="crown">
    **$2,800 PAYAI**
    
    - 1,000,000 settlements/month
    - 25 requests/second
    - 3,000 burst requests/minute
    
    For high-volume production use.
  </Card>
</CardGroup>

<Note>
  Pricing is subject to change. Visit [facilitator.payai.network](https://facilitator.payai.network) for the latest pricing information.
</Note>

## Need help?

<DiscordHelpCard />
```

#### 10.2 Update Navigation
Add the pricing page to `docs.json` under the "x402 Facilitator" group:

```json
{
  "group": "x402 Facilitator",
  "pages": [
    "x402/facilitators/introduction",
    "x402/supported-networks",
    "x402/facilitators/pricing"
  ]
}
```

### Acceptance Criteria
- [ ] Pricing page exists with three tiers
- [ ] Navigation includes pricing page
- [ ] Pricing matches current facilitator.payai.network offerings

---

## Issue 11: Update Echo Merchant for V2 Headers

**Priority:** High  
**Estimated Effort:** Small  

### Description
Update the Echo Merchant getting started guide to reflect V2 header names.

### Tasks

#### 11.1 Update Step 3 Description
In `x402-echo/getting-started.mdx`, update the header references:

**Current (line 40):**
```mdx
Run the client. You should see the initial `402`, a retry with `X-PAYMENT`, a `200 OK` response, and a decodable `X-PAYMENT-RESPONSE` header.
```

**Updated:**
```mdx
Run the client. You should see:
1. Initial `402 Payment Required` response with `PAYMENT-REQUIRED` header
2. A retry with `PAYMENT-SIGNATURE` header containing your payment
3. A `200 OK` response with `PAYMENT-RESPONSE` header containing settlement details

The tokens you sent are refunded automatically and PayAI covers the fees.
```

#### 11.2 Update Introduction Page
In `x402-echo/introduction.mdx`, update any references to V1 headers to V2:

Update line 24-25:
```mdx
3. Your client constructs a Payment Payload and retries with the `PAYMENT-SIGNATURE` header.
...
5. The response includes `PAYMENT-RESPONSE` (base64 JSON) you can decode for details.
```

### Acceptance Criteria
- [ ] All header references use V2 names (`PAYMENT-REQUIRED`, `PAYMENT-SIGNATURE`, `PAYMENT-RESPONSE`)
- [ ] No references to old V1 headers (`X-PAYMENT`, `X-PAYMENT-RESPONSE`)

---

## Issue 12: Update x402 Reference to V2 (Major)

**Priority:** Critical  
**Estimated Effort:** Large  

### Description
Update the x402 reference documentation to reflect V2 specification changes. The existing V1 content should be preserved in a tab or separate section.

### Tasks

#### 12.1 Create V2 Reference Content
Update `x402/reference.mdx` to use V2 specification as the default. Key changes:

**Header Changes:**
- `X-PAYMENT` → `PAYMENT-SIGNATURE`
- `X-PAYMENT-RESPONSE` → `PAYMENT-RESPONSE`  
- New: `PAYMENT-REQUIRED` header

**Network Format Changes:**
- `base-sepolia` → `eip155:84532`
- `base` → `eip155:8453`
- `solana-devnet` → `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1`
- `solana` → `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`

**Schema Changes:**
- `maxAmountRequired` → `amount`
- New `resource` object with `url`, `description`, `mimeType`
- `accepted` field in PaymentPayload instead of inline
- `extensions` field added

#### 12.2 Structure Options

**Option A: Tabs within the same page**
```mdx
<Tabs>
  <Tab title="V2 (Current)">
    ... V2 content ...
  </Tab>
  <Tab title="V1 (Legacy)">
    ... existing V1 content ...
  </Tab>
</Tabs>
```

**Option B: Separate pages**
- `x402/reference.mdx` - V2 content (default)
- `x402/reference-v1.mdx` - V1 content (legacy)
- Update navigation to show both with V1 marked as legacy

**Recommendation:** Option A (tabs) for easier maintenance

#### 12.3 Key V2 Updates to Reference

Update all JSON examples to V2 format. Example PaymentRequired:

```json
{
  "x402Version": 2,
  "error": "PAYMENT-SIGNATURE header is required",
  "resource": {
    "url": "https://api.example.com/premium-data",
    "description": "Access to premium market data",
    "mimeType": "application/json"
  },
  "accepts": [
    {
      "scheme": "exact",
      "network": "eip155:84532",
      "amount": "10000",
      "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      "payTo": "0x209693Bc6afc0C5328bA36FaF03C514EF312287C",
      "maxTimeoutSeconds": 60,
      "extra": {
        "name": "USDC",
        "version": "2"
      }
    }
  ],
  "extensions": {}
}
```

#### 12.4 Update Field Description Tables
Update all tables to match V2 schema (see `/x402/specs/x402-specification-v2.md` for complete field definitions).

### Acceptance Criteria
- [ ] V2 is the default shown to users
- [ ] V1 content is preserved and accessible
- [ ] All JSON examples use V2 format
- [ ] Network identifiers use CAIP-2 format
- [ ] Header names are updated throughout
- [ ] Field descriptions match V2 spec

---

## Issue 13: Update All Python Docs to V2

**Priority:** High  
**Estimated Effort:** Medium  

### Description
Update all Python documentation (FastAPI, Flask, httpx, requests) to match V2 specification from the upstream repo.

### Tasks

#### 13.1 Review Upstream Python Examples
Check the upstream repo at `https://github.com/coinbase/x402/tree/main/examples/python` for V2 updates.

#### 13.2 Update FastAPI Docs
In `x402/servers/python/fastapi.mdx`:
- Update code examples to use V2 APIs
- Update network format to CAIP-2 (if applicable)
- Verify import statements match current package

#### 13.3 Update Flask Docs
In `x402/servers/python/flask.mdx`:
- Update code examples to use V2 APIs
- Update network format to CAIP-2 (if applicable)
- Verify import statements match current package

#### 13.4 Update httpx Docs
In `x402/clients/python/httpx.mdx`:
- Update code examples to use V2 APIs
- Verify header names in examples (if shown)

#### 13.5 Update requests Docs
In `x402/clients/python/requests.mdx`:
- Update code examples to use V2 APIs
- Verify header names in examples (if shown)

### Acceptance Criteria
- [ ] All Python docs use V2 APIs
- [ ] Code examples work with current x402 Python package
- [ ] Network identifiers are updated if necessary

---

## Issue 14: Update All TypeScript Docs to V2

**Priority:** High  
**Estimated Effort:** Medium  

### Description
Update all TypeScript documentation to match V2 specification.

### Tasks

#### 14.1 Review Upstream TypeScript Examples
Check `https://github.com/coinbase/x402/tree/main/examples/typescript` for V2 updates.

#### 14.2 Update Express Docs
- Remove CDP API key references
- Update any V1-specific code patterns

#### 14.3 Update Hono Docs
- Ensure consistency with Express
- Update to starter template if available

#### 14.4 Update Next.js Docs
- Remove CDP API key references (partially done in Issue 4)
- Update any V1-specific patterns

#### 14.5 Update Axios Client Docs
- Verify header names in decoded response examples

#### 14.6 Update Fetch Client Docs
- Fix step numbering (Issue 6)
- Verify header names in decoded response examples

### Acceptance Criteria
- [ ] All TypeScript docs use V2 patterns
- [ ] CDP API keys removed from all examples
- [ ] Code examples work with current packages

---

## Issue 15: Add Discovery/Bazaar Section (Future)

**Priority:** Low  
**Estimated Effort:** Medium  

### Description
Add documentation for the Discovery API and Bazaar concept. This can be done in a later phase.

### Tasks

#### 15.1 Create Discovery Documentation
- Explain the Bazaar concept
- Document the `/discovery/resources` endpoint
- Provide example usage

### Acceptance Criteria
- [ ] Discovery section exists in merchant docs
- [ ] Bazaar concept is explained
- [ ] API documentation is complete

---

## Issue 16: Consider Navigation Restructure (Optional)

**Priority:** Low  
**Estimated Effort:** Small  

### Description
Consider moving the x402 reference higher in the navigation for easier access.

### Suggested Order
1. x402 Introduction
2. Quickstart
3. **x402 Reference** (moved up)
4. x402 Merchants
5. x402 Clients
6. x402 Facilitator
7. Echo Merchant

### Tasks
- Review with team if this change improves UX
- Update `docs.json` navigation order

---

## Execution Order Recommendation

### Phase 1: Critical Cleanup (Issues 1, 9, 11)
- Remove deprecated products
- Fix broken links
- Update Echo Merchant V2 headers

### Phase 2: Core V2 Updates (Issues 12, 13, 14)
- Update reference to V2
- Update Python docs to V2
- Update TypeScript docs to V2

### Phase 3: UX Improvements (Issues 2, 3, 4, 5)
- Improve merchant introduction
- Update Hono to use starter
- Improve Next.js docs
- Improve client introduction

### Phase 4: Polish (Issues 6, 7, 8, 10)
- Fix typos
- Add reference callouts
- Add pricing section
- Update test instructions

### Phase 5: Future Enhancements (Issues 15, 16)
- Add discovery/bazaar docs
- Consider navigation restructure

---

## Notes for DevRel/AI Agents

1. **Always check upstream**: Before updating any example code, check the upstream x402 repo for the latest patterns
2. **Maintain consistency**: Keep the same structure across similar documents (e.g., all quickstarts should follow the same format)
3. **Test links**: After making changes, verify all internal links work
4. **Preview locally**: Use `mintlify dev` to preview changes before committing
5. **V2 Header Reference**:
   - `PAYMENT-REQUIRED` - Server response header with payment requirements
   - `PAYMENT-SIGNATURE` - Client request header with payment payload
   - `PAYMENT-RESPONSE` - Server response header with settlement details
6. **V2 Network Format**: Use CAIP-2 format (e.g., `eip155:8453` not `base`)

