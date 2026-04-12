---
name: marketing-automation
description: >
  Route broad product and growth marketing requests into one clear deliverable lane
  across CRO, copywriting, SEO, lifecycle messaging, analytics, pricing, launch,
  retention, and experiment planning. Use when the user needs general marketing
  help for a website, SaaS product, funnel, launch, onboarding flow, campaign, or
  reporting question and the first job is to turn a messy ask into a KPI-aware
  brief, a chosen marketing lane, and an implementation-ready packet. Triggers on:
  marketing plan, growth help, launch messaging, onboarding emails, landing page
  conversion, SEO brief, pricing copy, campaign plan, funnel optimization.
allowed-tools: Write Read WebSearch WebFetch Task
compatibility: >
  General marketing router for SaaS, product, web, and lifecycle work. Prefer
  narrower skills when the request is already obviously domain-specific.
metadata:
  tags: marketing, cro, copywriting, seo, analytics, growth, automation
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "2.0"
---

# Marketing Automation

Use this skill as the **canonical general marketing router** for the repository.

The job is not to dump generic growth advice. The job is to:
1. normalize a messy request into a usable marketing brief,
2. pick the single best marketing lane,
3. produce the next deliverable packet,
4. leave a measurement-aware implementation handoff.

Read [references/routing-heuristics.md](references/routing-heuristics.md) for lane-selection rules and [references/measurement-handoff.md](references/measurement-handoff.md) before routing broad requests.

## When to use this skill
- The user asks for broad marketing help and the correct lane is not yet obvious
- A product, website, funnel, or launch needs one structured marketing brief before detailed execution starts
- The request spans multiple possible lanes such as CRO, copy, lifecycle, SEO, analytics, pricing, or launch planning
- The user wants a KPI-aware packet that a narrower marketing or execution workflow could pick up next

## When not to use this skill
- The request is already clearly Steam/store-page/festival launch work for a game → prefer `steam-store-launch-ops`
- The request is already a narrow SEO/content optimization workflow with enough detail to stay specialist
- The request is really product planning, UX research, or technical implementation rather than marketing routing
- The user wants only one atomic copy rewrite and no broader routing or measurement layer

## Supported lanes
Use these as routing targets inside the skill:

### CRO
- `page-cro`
- `signup-flow`
- `onboarding`
- `form-optimization`
- `paywall`

### Copy & messaging
- `copywriting`
- `copy-editing`
- `email-sequence`
- `social-content`

### SEO & content
- `seo-audit`
- `programmatic-seo`
- `comparison-page`
- `schema-markup`

### Ads & analytics
- `analytics-tracking`
- `paid-ads`
- `ab-test`

### Strategy & growth
- `launch-strategy`
- `pricing-strategy`
- `retention`
- `churn-analysis`
- `growth-experiments`
- `referral-program`
- `content-strategy`

## Instructions

### Step 1: Normalize the marketing brief
Capture the request in this form before choosing a lane:

```yaml
marketing_brief:
  objective: acquisition | activation | conversion | retention | revenue | awareness | unknown
  primary_kpi: "the one number that matters most right now"
  audience:
    segment: "who is this for"
    pain_points:
      - pain 1
      - pain 2
    stage: unaware | problem-aware | solution-aware | evaluating | active-user | churn-risk | unknown
  asset_or_surface: landing-page | pricing-page | onboarding-flow | lifecycle-email | seo-page | campaign | launch | analytics | unknown
  offer:
    product: "product / feature / package"
    value_prop: "main promise"
    proof_points:
      - proof 1
      - proof 2
  constraints:
    channel: web | email | social | ads | search | mixed | unknown
    timeline: immediate | this-week | this-month | longer
    brand_or_compliance_notes: "voice, legal, or positioning limits"
  main_question: "what does the user actually need next?"
```

If the packet is incomplete, continue with explicit assumptions instead of stalling.

### Step 2: Pick one primary lane
Choose exactly one lane.

- **CRO** when the request is about improving a page, flow, form, or paywall
- **Copy & messaging** when the main bottleneck is words, positioning, or conversion copy
- **SEO & content** when the request centers on search demand, structure, comparison pages, or content strategy
- **Ads & analytics** when the request is about tracking, paid acquisition, or test/readout setup
- **Strategy & growth** when the user needs launch planning, pricing, retention, churn, referral, or experiment prioritization

If more than one lane is relevant, choose the lane that reduces ambiguity fastest and mention the secondary handoff.

### Step 3: Return one implementation-ready packet
Return one of these deliverable types:
- `marketing-routing brief`
- `channel-ready brief`
- `copy/messaging packet`
- `measurement + experiment packet`
- `launch/growth brief`

Do not emit five half-finished plans. Choose the single most useful packet for the current ask.

### Step 4: Add explicit handoff and measurement logic
Every output must include:
- the chosen lane,
- the primary KPI,
- what assumptions remain,
- what execution artifact should be created next,
- what to measure after implementation.

### Step 5: Use this output structure

```markdown
# Marketing Routing Brief

## Scope
- Objective: ...
- Primary KPI: ...
- Audience: ...
- Surface / channel: ...
- Confidence: high | medium | low

## Chosen lane
- CRO | Copy & messaging | SEO & content | Ads & analytics | Strategy & growth

## What matters most now
- 2-4 bullets

## Recommended packet
- One of: marketing-routing brief | channel-ready brief | copy/messaging packet | measurement + experiment packet | launch/growth brief

## Priority decisions
| Decision | Why now | Owner | Risk if delayed |
|----------|---------|-------|-----------------|
| ... | ... | ... | ... |

## Immediate next steps
1. ...
2. ...
3. ...

## Secondary handoffs
- Skill / workflow: ...
- Why: ...
- What packet to pass: ...

## Measurement checklist
- Event / signal: ...
- Baseline or assumption: ...
- Success threshold: ...

## What not to do yet
- 1-3 bullets that prevent scope drift or premature channel sprawl
```

## Output format
Always return a **short operator-style marketing routing brief**.

Required qualities:
- one KPI, not a vague wish list
- one primary lane, not a channel soup
- concrete next artifact and handoff
- explicit assumptions when context is missing
- lightweight measurement plan tied to the chosen lane

## Examples

### Example 1: broad launch ask
**Input**
> We are launching a new SaaS workflow next month and need help with messaging, landing page copy, onboarding emails, and how to measure whether it worked.

**Output sketch**
- Primary lane: `Strategy & growth`
- Packet: `launch/growth brief`
- Secondary handoff mentions copy/messaging and lifecycle execution
- Measurement checklist names launch KPI, activation milestone, and follow-up experiment

### Example 2: landing page conversion ask
**Input**
> Our homepage gets traffic but signups are flat. Help with conversion.

**Output sketch**
- Primary lane: `CRO`
- Packet: `measurement + experiment packet`
- Priority decisions cover page promise, CTA hierarchy, friction points, and test order

### Example 3: legacy broad catalog ask
**Input**
> Use the marketing skills collection to figure out the best lane for this pricing-page refresh.

**Output sketch**
- Resolve to the canonical `marketing-automation` flow
- Choose `CRO` or `Copy & messaging` as the primary lane based on the packet
- Leave a short note that the legacy name maps to the same routing logic

## Best practices
1. **Act like a router, not a slogan generator** — clarify the lane before producing assets.
2. **Choose one KPI and one primary lane** — that constraint makes the output reusable.
3. **Prefer implementation packets over generic advice** — the next team should know what to do.
4. **Keep measurement attached to the packet** — a marketing plan without instrumentation is unfinished.
5. **Defer niche domains to narrower skills** when a dedicated workflow is already stronger.

## References
- [references/routing-heuristics.md](references/routing-heuristics.md)
- [references/measurement-handoff.md](references/measurement-handoff.md)
- `../marketing-skills-collection/SKILL.md`
- `../steam-store-launch-ops/SKILL.md`
