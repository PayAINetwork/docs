# Copywriter Onboarding Guide

Welcome to PayAI! This document will help you get up to speed on everything you need to know to create compelling content for our blog and social media channels.

---

## Table of Contents

1. [About PayAI](#about-payai)
2. [Core Technology: Understanding x402](#core-technology-understanding-x402)
3. [Products & Services](#products--services)
4. [Target Audiences](#target-audiences)
5. [Brand Voice & Tone](#brand-voice--tone)
6. [Content Strategy](#content-strategy)
7. [Content Platforms](#content-platforms)
8. [Content Calendar & Workflow](#content-calendar--workflow)
9. [Key Terminology Glossary](#key-terminology-glossary)
10. [Ecosystem & Partners](#ecosystem--partners)
11. [Resources & Tools](#resources--tools)
12. [Team Contacts](#team-contacts)

---

## About PayAI

### Mission Statement

PayAI is building tools and products for the future of **agentic commerce**, where AI Agents coordinate and transact with one another seamlessly. Our open-source technologies empower developers to create and monetize AI agents and services.

### The Big Picture

We're at the forefront of a new economy where AI agents—autonomous software programs that can act on behalf of users—need to pay each other for services. Imagine an AI assistant that can automatically pay for:
- API calls to other AI services
- Premium data access
- Computation time
- Any digital resource

PayAI provides the infrastructure that makes these payments possible, instant, and trustless.

### Business Goals

1. **Increase the number of web3 developers using the PayAI Facilitator**
2. **Increase the number of participants buying $PAYAI and using it in the PayAI ecosystem**
3. **Increase visibility/awareness of PayAI**

---

## Core Technology: Understanding x402

### What is x402?

x402 is a payment protocol that enables **pay-per-use API transactions**. The name comes from HTTP status code 402 "Payment Required"—a code that was reserved for future use since the early days of the internet and is now finally being put to work.

**Key concepts to understand:**

- **x402 Protocol**: An open standard for embedding payments directly into HTTP requests. When a client tries to access a paid resource, instead of getting an error, they get a payment request that can be fulfilled automatically.

- **Facilitator**: The middleware service that handles payment verification and settlement. PayAI operates a Solana-first, multi-network facilitator that supports payments across multiple blockchain networks.

- **Merchant/Server**: Any service provider who wants to charge for their API or content.

- **Client**: Any application or AI agent that wants to pay for and access paid resources.

### How x402 Works (Simple Explanation)

1. A client (like an AI agent) tries to access a paid API endpoint
2. The server responds with a "402 Payment Required" status and payment details
3. The client automatically creates and signs a payment transaction
4. The payment is verified by the facilitator
5. Access is granted—all in milliseconds

**Why this matters for content:**
- This is NEW technology—many people don't know what x402 is
- Educational content explaining x402 is our highest priority
- We need to make complex concepts accessible to both developers and crypto enthusiasts

---

## Products & Services

### 1. PayAI Facilitator

**What it is:** Our core product—a hosted service that handles x402 payment verification and settlement.

**Key features:**
- Solana-first, multi-network support (Base, Polygon, SKALE, Avalanche, and more)
- Free tier: Up to 1,000 settlements/month at no cost
- Paid tier: $0.001 per transaction beyond free tier
- 10% discount when paying with $PAYAI token
- $PAYAI used for credits gets burned 🔥

**URL:** https://facilitator.payai.network

### 2. X402 Echo Merchant

**What it is:** A live demo merchant where anyone can test x402 payments instantly. You pay, and get 100% refunded.

**Purpose:** Lets developers and curious users experience x402 firsthand without risk.

### 3. $PAYAI Token

**What it is:** Our native token on Solana

**Key facts:**
- Total supply: 1,000,000,000 $PAYAI (fixed, cannot be changed)
- 100% liquid at launch
- Utility: Payment for facilitator credits (with 10% discount)
- Tokens used for credits are burned, creating deflationary pressure

---

## Target Audiences

We have **two primary audiences** with different needs and content preferences:

### 1. Web3 and AI Developers (Primary Target)

**Demographics:**
- Primarily software developers building with blockchain technology
- Higher education levels (Bachelor's or higher)
- Technical, detail-oriented
- Building AI agents, APIs, or digital services

**Where they hang out:**
- Twitter (X)
- Discord
- Reddit
- YouTube
- GitHub

**Pain points:**
- Complicated payment setups
- Unclear documentation
- Lack of easy-to-use tools
- Need recognition for their work

**Content they engage with:**
- Technical tutorials
- Code snippets and examples
- Documentation
- Demo videos
- Starter kits and templates

**Motivations:**
- Building tools people use
- Gaining recognition
- Creating cool things

### 2. Crypto Speculators/Web3 Community

**Demographics:**
- 69% are 25-44 years old
- 91% male
- 18% US, 6% Nigeria, 5% UK, 5% Hong Kong
- Range from casual to serious investors

**Where they hang out:**
- Twitter (X)
- Telegram
- YouTube
- Instagram
- TikTok

**Pain points:**
- Scams and rug pulls
- Dying tokens
- Dishonest teams
- Unclear project vision

**Content they engage with:**
- Investment theses
- Market commentary
- Charts and analysis
- News and updates
- Memes and trends

**Motivations:**
- Making money
- Not losing money
- Being early on promising projects

---

## Brand Voice & Tone

### Voice Characteristics

**Professional but Approachable**
- We're building serious infrastructure, but we don't take ourselves too seriously
- Technical accuracy is paramount, but accessibility matters more

**Confident but Humble**
- We believe in what we're building
- We acknowledge we're part of a larger ecosystem
- We celebrate our partners and builders

**Educational First**
- Our default mode is to teach, not sell
- We explain complex concepts simply
- We assume good faith from our audience

### Tone by Content Type

| Content Type | Tone |
|-------------|------|
| Educational content | Clear, patient, helpful |
| Product announcements | Excited, professional |
| Developer tutorials | Technical, precise, supportive |
| Weekly recaps | Upbeat, celebratory |
| Memes/trends | Fun, witty, timely |
| Community engagement | Warm, encouraging |

### Writing Guidelines

**DO:**
- Use active voice
- Keep sentences concise
- Break up long content with bullet points
- Include specific numbers and examples when possible
- Use emojis sparingly but effectively (🔥 💪 ⚡ are common)
- Make technical concepts accessible

**DON'T:**
- Use jargon without explanation
- Overpromise or hype
- Be condescending
- Use excessive exclamation marks
- Make claims about token price or returns

### Common Phrases and Terms

- "Agentic commerce" (our core concept)
- "AI Agents" (not "AI bots" or "AI programs")
- "The future of payments"
- "Trustless" and "permissionless" (web3 concepts)
- "Powered by PayAI"
- "Built with PayAI"

---

## Content Strategy

### Content Pillars

Our content is organized into four main pillars:

#### 1. Educational (Highest Priority)

**Purpose:** Build awareness and understanding of x402 and PayAI

**Topics:**
- What is x402?
- How do AI agents pay each other?
- Benefits of pay-per-use APIs
- Tutorial and integration guides
- Code snippet tips and tricks
- FAQs and ELI5 (Explain Like I'm 5) content

**Formats:** Threads, infographics, blog posts, short demo videos

**Frequency target:** 2-3 times per week

#### 2. Inspirational

**Purpose:** Showcase the development journey and inspire developers

**Topics:**
- Builder Banter highlights (our bi-weekly X Space)
- Ecosystem project spotlights
- Developer progress updates
- Milestone celebrations
- Weekly idea lists ("Ideathon")

**Formats:** Short videos, threads, developer quotes

**Frequency target:** 3 times per week

#### 3. Promotional

**Purpose:** Announce updates and drive adoption

**Topics:**
- Product/feature announcements
- New network support
- Partnership announcements
- Weekly recaps
- Merchant of the Week

**Formats:** Announcement graphics, recap threads

**Frequency target:** 1-2 times per week

#### 4. Entertaining/Community

**Purpose:** Build community and engagement

**Topics:**
- Memes and trend remixes
- Polls and Q&As
- Event highlights
- Copy pasta (adapting viral formats)

**Formats:** Memes, polls, quote tweets

**Frequency target:** 2-4 times per week

---

## Content Platforms

### Primary Platforms

#### Blog - https://blog.payai.network

**Purpose:** Content for SEO and organic search visibility

**Why this matters:** The blog is critical for driving inbound sales through organic search. Every piece of content we publish should be optimized for SEO to help us rank for key terms like "x402," "AI agent payments," "micropayments," and related topics.

**Content types:**
- Educational deep-dives (What is x402?, How micropayments work)
- Technical tutorials and guides
- Case studies of projects built with PayAI
- Product announcements and updates
- Thought leadership pieces
- Ecosystem partner spotlights

**Best practices:**
- Include relevant keywords naturally throughout
- Use proper heading hierarchy (H1, H2, H3)
- Include internal links to other blog posts and documentation
- Add external links to reputable sources
- Write compelling meta descriptions
- Aim for 1,000+ words for pillar content

#### Twitter (X) - @PayAINetwork

**Purpose:** Primary social platform for all audiences

**Content types:**
- Threads (educational, announcements)
- Quote tweets (ecosystem spotlights)
- Images and videos
- Spaces (Builder Banter, AMAs)
- Weekly recaps

**Founder account:** @notorious_d_e_v (used for Tier 1 project engagement)

#### Telegram

**Purpose:** Community management and real-time updates

**Content types:**
- Pinned announcements
- Community discussions
- Buy bot and engagement bots

#### Discord

**Purpose:** Developer community and support

**Content types:**
- Developer Q&A
- Technical support

### Secondary Platforms

#### YouTube (future)

**Purpose:** Long-form tutorials and AMAs

**Content types:**
- Tutorial videos
- Workshop recordings
- Space recordings
- Demos

#### Instagram & TikTok (future)

**Purpose:** Broader reach, especially for crypto community

**Content types:**
- Short-form videos
- Infographics
- Behind-the-scenes

---

## Content Calendar & Workflow

### Recurring Content

| Content | Frequency | Day | Content Pillar |
|---------|-----------|-----|----------------|
| Weekly Recap | Weekly | Sunday | Promotional |
| Builder Banter | Bi-weekly | Monday | Inspirational |
| Merchant of the Week | Weekly | Varies | Promotional |
| Product Updates | As available | Varies | Promotional |
| Ecosystem Spotlights | Ongoing | Varies | Inspirational |
| Educational threads | 2-3x/week | Varies | Educational |

### Content Workflow

1. **Ideation:** Brainstorm ideas in the Social Media Content Calendar (Notion)
2. **Drafting:** Write content directly in Notion with appropriate tone
3. **Review:** Get approval from team (Notorious D.E.V for technical accuracy)
4. **Scheduling:** Schedule posts using the Social Media Content Calendar in Notion
5. **Publishing:** Follow content calendar
6. **Engagement:** Monitor and respond to comments

### Content Management Tool

**Social Media Content Calendar (Notion)**
- Central hub for all content planning and drafting
- Organize content by platform (Twitter, Blog, etc.)
- Track content status (Idea → Drafting → Review → Scheduled → Published)
- Team collaboration and feedback
- View content in calendar format for scheduling

---

## Key Terminology Glossary

| Term | Definition |
|------|------------|
| **x402** | A payment protocol using HTTP 402 status code for pay-per-use APIs |
| **Facilitator** | Service that verifies and settles x402 payments |
| **Agentic Commerce** | Commerce where AI agents transact autonomously |
| **Settlement** | When a payment is finalized and funds are transferred |
| **Merchant** | Any service provider accepting x402 payments |
| **Client** | Application or agent making x402 payments |
| **Web3** | The decentralized internet built on blockchain |
| **Solana** | A high-speed blockchain; our primary network |
| **EVM** | Ethereum Virtual Machine; standard for Ethereum-compatible chains |
| **Base** | Coinbase's layer-2 blockchain |
| **Token burn** | Permanently removing tokens from circulation |
| **Micropayments** | Small payments (often fractions of a cent) |
| **8004/ERC-8004** | An Ethereum standard for AI agent reputation and trust |
| **ElizaOS** | Popular open-source framework for AI agents |

---

## Ecosystem & Partners

### Key Partners

- **Solana Foundation** - Primary blockchain partner
- **Coinbase** - Strategic partner, Base network support
- **x402.org** - Protocol standard organization
- **ElizaOS** - AI agent framework
- **TGMetrics** - Telegram analytics partner
- **MCPay** - Payment infrastructure
- **OOBE Protocol** - AI infrastructure
- **OmniMinds** - AI partner

### Supported Networks

- Solana (Primary)
- Base
- Polygon
- SKALE
- Avalanche
- Sei
- IoTeX

### Ecosystem Projects

We maintain (soon) a "Built with PayAI" section on our website featuring projects that have integrated with our facilitator. These projects are organized into tiers:

- **Tier 1:** Strategic partners (significant volume, strong brand)
- **Tier 2:** Growth projects (active, growing)
- **Tier 3:** Early stage (just launched, promising)

For detailed processes on how we engage with ecosystem projects, see the [Ecosystem Marketing SOP](https://www.notion.so/2ea8b686d2448012a7d7e016348ab075) in Notion.

---

## Resources & Tools

### Official Links

| Resource | URL |
|----------|-----|
| Main Website | https://payai.network |
| Blog | https://blog.payai.network |
| Facilitator | https://facilitator.payai.network |
| Documentation | https://docs.payai.network |
| X402 Echo (Demo) | [Try x402 payments] |
| Twitter | https://x.com/PayAINetwork |
| Telegram | [Community TG] |
| Discord | [Developer Discord] |
| Partnership Form | https://docs.google.com/forms/d/e/1FAIpQLSeRaLKHcEbvS9AG-Jmlj15Vo-srp6AbNKKFTJOL0lAYGKAH0A/viewform |

### Internal Resources

| Resource | Location |
|----------|----------|
| Content Drafting & Calendar | Notion - "Social Media Content Calendar" |
| Marketing Strategy | Notion - "PayAI Marketing Strategy" |
| Ecosystem SOP | Notion - "Ecosystem Marketing SOP" |
| Brand Assets | GitHub - https://github.com/PayAINetwork/brand-assets |
| Tweet Examples | Notion - "Tweets" page |

### Brand Assets Location

All logos and brand materials are available on GitHub: https://github.com/PayAINetwork/brand-assets

**Folder structure:**
- **Logos:** `assets/mark/` (various sizes in PNG and SVG)
- **Wordmarks:** `assets/wordmark/` 
- **Horizontal lockups:** `assets/lockups/horizontal/`
- **Vertical lockups:** `assets/lockups/vertical/`

Available in light, dark, and blue variants with transparent and white backgrounds.

---

## Team Contacts

### Key Team Members

| Role | Name/Handle | Contact For |
|------|-------------|-------------|
| Founder | @notorious_d_e_v | Strategy, technical accuracy, Tier 1 approvals |
| Lead Engineer | Aptum | Technical questions, product details |
| DevRel | Nino | Developer content, technical tutorials, community |
| Ecosystem & Marketing | trodd, Highzik, Betard | Day-to-day community operations and engagement |

### Communication

- **Notion:** Primary workspace for documentation and tracking
- **Telegram:** Team communication
- **Discord:** Developer community management

---

## Your First Week Checklist

- [ ] Read through this entire document
- [ ] Join all team communication channels (Telegram, Discord)
- [ ] Get access to Notion workspace
- [ ] Review the "PayAI Marketing Strategy" in Notion
- [ ] Review the "Ecosystem Marketing SOP" in Notion
- [ ] Study 10-15 recent tweets from @PayAINetwork
- [ ] Try the X402 Echo Merchant to experience x402 firsthand
- [ ] Read the documentation at docs.payai.network
- [ ] Familiarize yourself with Notion

---

## Quick Reference: Content Ideas by Type

### Blog Post Ideas

- "What is x402? A Complete Guide"
- "How AI Agents Pay Each Other"
- "Getting Started with PayAI Facilitator"
- "The Future of Micropayments"
- "Why x402 Matters for Developers"
- Case studies of projects built with PayAI
- Technical deep-dives for developers

### Tweet/Thread Ideas

- ELI5 explanations of x402
- Code snippet tips
- Weekly recap threads
- Ecosystem project spotlights
- "5 Things You Can Build with x402"
- Trend remixes relevant to AI/payments

### Educational Series Ideas

- "x402 Explained Like I'm 5" series
- "Meet the Builders" developer spotlights
- "Use Case of the Week"
- "Facilitator Feature Friday"

---

## Questions?

Don't hesitate to reach out to the team! We're excited to have you on board and look forward to the amazing content you'll create.

Welcome to PayAI! 🚀

---

*Last updated: January 2026*
