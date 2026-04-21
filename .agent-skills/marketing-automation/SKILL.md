---
name: marketing-automation
description: >
  Route broad product and growth marketing asks into one operating mode, one
  primary lane, and one reusable operator packet across launch planning,
  conversion surfaces, lifecycle/retention, acquisition/content, and
  measurement/experiments. Use when the user needs general marketing help for a
  website, SaaS product, funnel, onboarding flow, pricing page, campaign, or
  launch and the first job is deciding the right next brief with owner,
  dependencies, approvals, and proof instead of producing channel soup.
  Triggers on: marketing plan, GTM help, launch brief, pricing page refresh,
  lifecycle email strategy, conversion help, campaign measurement, content
  plan. Route Steam/store-page game launch work to `steam-store-launch-ops` and
  backlog/milestone shaping to `task-planning`.
allowed-tools: Write Read WebSearch WebFetch Task
compatibility: >
  General marketing front door for SaaS, product, web, and lifecycle work.
  Prefer narrower skills when the request is already clearly specialist or
  domain-specific.
metadata:
  tags: marketing, cro, copywriting, seo, analytics, growth, automation
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "2.1"
  hardening: 2026-04-18
---

# Marketing Automation

Use this skill as the **canonical broad marketing front door** when the real job is choosing the right next marketing packet.

The job is not to generate a giant campaign brainstorm. The job is to:
1. classify the ask into one operating mode,
2. choose one primary lane,
3. produce one reusable operator packet,
4. name the owner, dependencies, approvals, and proof stack,
5. route out when the request is actually planning, game-store launch ops, or another narrower specialist workflow.

Read these support docs before finalizing the packet:
- [references/operating-modes-and-route-outs.md](references/operating-modes-and-route-outs.md)
- [references/routing-heuristics.md](references/routing-heuristics.md)
- [references/operator-packet-and-proof-stack.md](references/operator-packet-and-proof-stack.md)
- [references/measurement-handoff.md](references/measurement-handoff.md)

## When to use this skill
- The user asks for broad marketing help and the right next packet is still ambiguous.
- A product, website, funnel, launch, onboarding flow, or pricing surface needs one structured marketing brief before detailed execution starts.
- The request mixes strategy, surface choice, messaging, content, channels, and measurement.
- The user needs a reusable operator brief, not a pile of disconnected suggestions.

## When not to use this skill
- **The ask is already clearly Steam/store-page/festival/game launch work** → `steam-store-launch-ops`.
- **The real job is backlog shaping, milestone coordination, or cross-functional implementation slicing** → `task-planning`.
- **The user wants only one atomic copy rewrite or finished content asset with no broader routing layer** → use the narrower writing/execution workflow directly.
- **The request is mostly product strategy, UX research, or technical implementation rather than marketing routing** → route to the stronger adjacent skill.

## Core routing model

### Operating modes
Use one primary mode per run:
- `launch-orchestration` — broad launch, GTM, pricing, or rollout sequencing across multiple surfaces
- `conversion-surface` — landing page, pricing page, signup flow, paywall, or onboarding conversion friction
- `lifecycle-retention` — onboarding, activation, retention, churn, lifecycle email, re-engagement, or user education motion
- `acquisition-content` — SEO, content strategy, comparison pages, organic acquisition, or channel-facing discovery work
- `measurement-experiment` — analytics setup, attribution, KPI cleanup, campaign readout, or experiment/backlog instrumentation

### Primary lanes
After choosing the mode, still choose one primary lane:
- `CRO`
- `Copy & messaging`
- `SEO & content`
- `Ads & analytics`
- `Strategy & growth`

The mode explains **what kind of situation this is**.
The lane explains **which marketing discipline owns the next packet**.

## Instructions

### Step 1: Normalize the intake into one routing profile
Capture the request in this compact form before choosing the packet:

```yaml
marketing_router_profile:
  primary_mode: launch-orchestration | conversion-surface | lifecycle-retention | acquisition-content | measurement-experiment
  primary_lane: CRO | Copy & messaging | SEO & content | Ads & analytics | Strategy & growth | unknown
  objective: acquisition | activation | conversion | retention | revenue | awareness | unknown
  audience:
    segment: "who this is for"
    stage: unaware | problem-aware | evaluating | active-user | churn-risk | unknown
  surface_or_channel: landing-page | pricing-page | signup-flow | onboarding | lifecycle-email | seo-page | campaign | dashboard | launch | unknown
  offer_or_motion: "product / feature / campaign / launch motion"
  measurement_maturity: clear | partial | weak
  main_question: "what needs to be decided next?"
  delivery_owner: "who will carry the packet next"
  dependencies_or_approvals:
    - "design / analytics / engineering / legal / partner / none"
  proof_assets_available:
    - "dashboard / baseline export / campaign data / user feedback / none"
  constraints:
    timeline: immediate | this-week | this-month | longer
    brand_or_compliance_notes: "limits or promises"
    domain_specificity: general | specialist | game-store
```

If detail is missing, proceed with explicit assumptions instead of stalling.

### Step 2: Gather the minimum credible evidence
Do not route from vibes alone. Pull the smallest packet that supports a real decision:
- objective and current bottleneck
- audience / segment / funnel stage
- surface, campaign, or lifecycle moment
- available proof points or constraints
- current KPI or best available proxy
- who owns the next move
- which dependencies or approvals can block execution
- what is still missing that could change the lane choice

### Step 3: Choose one mode, one lane, one packet
Use [references/operating-modes-and-route-outs.md](references/operating-modes-and-route-outs.md).

Default packet mapping:
- `launch-orchestration` → usually `Strategy & growth` → `launch/growth brief`
- `conversion-surface` → usually `CRO` or `Copy & messaging` → `measurement + experiment packet`
- `lifecycle-retention` → usually `Strategy & growth` or `Copy & messaging` → `channel-ready brief`
- `acquisition-content` → usually `SEO & content` → `channel-ready brief`
- `measurement-experiment` → usually `Ads & analytics` → `measurement + experiment packet`

Rules:
- Choose **one primary mode**.
- Choose **one primary lane**.
- Return **one primary packet**.
- Mention secondary handoffs only after the main packet is chosen.

### Step 4: Add route-outs before the packet sprawls
Route out instead of absorbing adjacent work when:
- the ask is really Steam wishlists / capsules / Next Fest / store visibility → `steam-store-launch-ops`
- the ask is really execution slicing / backlog organization / milestone coordination → `task-planning`
- the ask is already a narrow specialist workflow with a better dedicated skill

A good front door narrows the next move. It does not win by claiming every neighboring job.

### Step 5: Build the operator brief
Use [references/operator-packet-and-proof-stack.md](references/operator-packet-and-proof-stack.md).

Return this structure:

```markdown
# Marketing Routing Brief

## Intake summary
- Mode: ...
- Primary lane: ...
- Objective: ...
- Audience / stage: ...
- Surface / channel: ...
- Confidence: high | medium | low

## What matters most now
- 2-4 bullets

## Recommended packet
- Packet type: launch/growth brief | channel-ready brief | copy/messaging packet | measurement + experiment packet | marketing-routing brief
- Why this packet now: ...

## Operator packet
- Primary owner: ...
- Dependencies / approvals: ...
- Required assets or inputs: ...
- Delivery horizon: ...

## Priority decisions
| Decision | Why now | Owner | Risk if delayed |
|----------|---------|-------|-----------------|
| ... | ... | ... | ... |

## Immediate next steps
1. ...
2. ...
3. ...

## Proof stack
- Primary KPI: ...
- Leading signal: ...
- Baseline or assumption: ...
- Success threshold: ...
- Readout window: ...
- Next owner / workflow: ...

## Secondary handoffs
- Skill / workflow: ...
- Why: ...

## Not yet
- 1-3 bullets that prevent scope drift
```

### Step 6: Keep proof attached to the packet
Every output must name:
- one primary KPI
- one leading signal
- one baseline or explicit assumption
- one success threshold
- one readout window or review checkpoint
- one next owner or downstream workflow

Use [references/operator-packet-and-proof-stack.md](references/operator-packet-and-proof-stack.md) for the operator packet shape and [references/measurement-handoff.md](references/measurement-handoff.md) for lane-specific KPI examples.

## Output format
Always return a **short operator-style Marketing Routing Brief**.

Required qualities:
- one primary mode
- one primary lane
- one packet that can actually be handed off
- explicit assumptions when context is thin
- named owner plus dependency/approval visibility
- route-outs when the ask is not really this skill
- proof logic attached to the packet, not bolted on later

## Examples

### Example 1: broad launch ask
**Input**
> We are launching a new SaaS workflow next month and need help with messaging, landing page copy, onboarding emails, and how to measure whether it worked.

**Output sketch**
- Mode: `launch-orchestration`
- Lane: `Strategy & growth`
- Packet: `launch/growth brief`
- Secondary handoffs mention copy/messaging and lifecycle execution
- Operator packet names one owner plus likely dependencies or approvals
- Proof stack names one launch KPI and one leading signal

### Example 2: pricing-page refresh
**Input**
> Our pricing page gets traffic, but upgrades are weak. We need help with the page and what to test.

**Output sketch**
- Mode: `conversion-surface`
- Lane: `CRO`
- Packet: `measurement + experiment packet`
- Priority decisions cover offer clarity, CTA hierarchy, proof, and friction

### Example 3: lifecycle / onboarding ask
**Input**
> Trial users activate once and disappear. We need onboarding and lifecycle help, plus a sensible KPI.

**Output sketch**
- Mode: `lifecycle-retention`
- Lane: `Strategy & growth` or `Copy & messaging`
- Packet: `channel-ready brief`
- Operator packet names the lifecycle owner and any analytics or product dependency
- Proof stack names activation or retained-usage KPI plus a leading signal

### Example 4: game-store launch near miss
**Input**
> We need Steam capsule copy and Next Fest marketing help for our game demo.

**Output sketch**
- Keep the response short
- Route execution to `steam-store-launch-ops`
- Leave only a concise handoff note instead of a giant generic marketing plan

## Best practices
1. **Act like a front-door router, not a generic growth advisor.**
2. **Choose one mode before you choose tactics.**
3. **Choose one packet before you list channels.**
4. **Keep owner, approvals, and dependencies visible instead of assuming automation removes them.**
5. **Keep launch/planning/game-store boundaries explicit.**
6. **Attach proof and ownership to every packet.**

## References
- [references/operating-modes-and-route-outs.md](references/operating-modes-and-route-outs.md)
- [references/routing-heuristics.md](references/routing-heuristics.md)
- [references/operator-packet-and-proof-stack.md](references/operator-packet-and-proof-stack.md)
- [references/measurement-handoff.md](references/measurement-handoff.md)
- `../marketing-skills-collection/SKILL.md`
- `../steam-store-launch-ops/SKILL.md`
- `../task-planning/SKILL.md`
