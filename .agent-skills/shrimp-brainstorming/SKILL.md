---
name: shrimp-brainstorming
description: Use when a user presents a vague project or business idea and wants to research, challenge, refine, validate, or turn it into a documented handoff.
version: 1.0.0
author: Scampi
license: MIT
metadata:
  hermes:
    tags: [brainstorming, ideation, research, validation, product-strategy]
---

# Shrimp Brainstorming

## Overview

Use this skill to turn an early project or business idea into a well-reasoned direction without forcing it through a rigid interview. The process is research-led and user-led: the user can ask questions, challenge findings, introduce constraints, or change direction at any point.

The goal is not to manufacture certainty or generate a generic list of ideas. The goal is to find the most credible wedge, expose weak assumptions, identify the cheapest useful test, and, when requested, produce a self-contained `final-spec.md` that explains both the conclusion and how it was reached.

## When to Use

Use when the user:

- Presents a vague product, service, startup, creator venture, tool, or business idea.
- Wants market, competitor, pricing, feasibility, monetization, distribution, or customer research for that idea.
- Wants to validate, refine, pivot, or abandon the idea.
- Wants a complete documented handoff for a project or business direction.

Do not use for:

- A simple factual lookup with no project or business decision attached.
- A settled implementation task where the product and scope are already decided.
- A generic request for many random startup ideas without intent to investigate one.

## Conversation Model

This is **user-led inquiry**, not a mandatory question funnel.

Default loop:

```text
User raises an idea or question
→ research and return a useful, opinionated response
→ user reacts, redirects, or asks the next question
→ update the working record after a material change
```

Ask a clarifying question only when a genuine ambiguity would send research toward the wrong domain, customer, or problem. Prefer a stated assumption and useful work over repeatedly pausing for permission.

Do not default to one-question-at-a-time interrogation. The user may drive the conversation by asking questions, requesting research, disputing a premise, or changing the destination.

## Working Model

Maintain these concepts throughout the exploration:

| Concept | Meaning |
|---|---|
| **Destination** | What this exploration must make clear, such as a decision, validation plan, or handoff spec. |
| **Current thesis** | The best current statement of the opportunity and wedge. It can change. |
| **Decision frontier** | Sharp questions or tests worth resolving next. |
| **Fog of war** | In-scope uncertainty that is not yet clear enough to investigate precisely. |
| **Out of scope** | Work consciously deferred or excluded from this effort. |
| **Rejected paths** | Alternatives considered and rejected, with reasons. |

These are organizational tools, not issue tickets or a forced workflow.

## Workflow

### 1. Orient

Identify the initial idea, intended destination, and material constraints already stated by the user.

- State assumptions when needed.
- Distinguish what is known, guessed, and unknown.
- Do not turn a vague idea into a detailed spec before it earns that specificity.

**Complete when:** there is a short current thesis and an initial decision frontier.

### 2. Research the reality

Research the facts that determine whether the idea is worth pursuing.

Depending on the idea, investigate:

- Direct competitors, adjacent products, substitutes, and inspirations.
- Customers, buyer pain, willingness to pay, and existing spending.
- Market timing, distribution, platform constraints, and technical feasibility.
- Pricing, business models, risks, and credible alternatives.

Label claims as evidence, inference, or assumption. Do not confuse “no direct competitor found” with “good idea.”

**Complete when:** the most important claims have sources or are explicitly marked as unproven.

### 3. Find the wedge

Turn broad ambition into a narrow first move.

- Prefer a concrete buyer, problem, and outcome over a large category claim.
- Identify what is differentiated, what is commodity, and what would be difficult to copy.
- Call out weak assumptions directly.
- Prefer small, fast, low-cost validation over elaborate plans.

**Complete when:** the current thesis states who it is for, what it does first, and why that first step is plausible.

### 4. Give a Shrimp Verdict

Give a candid verdict whenever enough evidence exists to make one. The verdict is revisable as new evidence appears.

- **Shrimp-Yes:** pursue the current wedge. State why and name the next test.
- **Shrimp-Maybe:** promising, but dependent on a specific unanswered question or validation step.
- **Shrimp-No:** not worth pursuing as framed. Explain why, and offer a pivot only if a credible one exists.

Avoid false precision. A verdict is a decision aid, not a guarantee.

**Complete when:** the user can understand the recommendation, its evidence, and what would change it.

### 5. Maintain the living record

For an exploration that persists beyond a quick response, keep a lightweight idea folder:

```text
idea-name/
├── concept-brief.md       # Current source of truth
├── research-ledger.md     # Findings, sources, confidence, implications
├── brainstorm.md          # Optional raw transcript, preserved unchanged
└── final-spec.md          # Complete clarified handoff, created on request
```

Update the concept brief and research ledger after material research, constraints, pivots, or decisions.

Never silently erase a rejected hypothesis. Move it to `Rejected paths` with the reason it changed.

If the user supplies a transcript as `brainstorm.md`, preserve it unchanged. If no full transcript is available, create a clearly labelled summary rather than fabricating one.

**Complete when:** the current thesis, decision frontier, and reasoning remain recoverable without rereading the entire chat.

### 6. Create the final handoff

Create `final-spec.md` only when the user asks for the final handoff or clearly indicates the direction is settled enough to document.

`final-spec.md` is not merely a snapshot of the final idea. It is a self-contained, readable account of the exploration. A reader who never saw the conversation should understand the original spark, what changed, why it changed, what was rejected, and what should happen next.

Use the template at `templates/final-spec.md`.

**Complete when:** the handoff includes the decision history, evidence, remaining uncertainty, and a concrete next step or implementation plan.

## Common Pitfalls

1. **Interrogating instead of helping.** Do research and bring back useful material. Ask only the questions that genuinely unblock the next useful step.
2. **Premature certainty.** Keep assumptions visible until evidence resolves them.
3. **Generic competitor research.** Classify competitors as direct, adjacent, substitute, inspiration, or noise, then explain the implication.
4. **Premature scope.** Do not design a full platform when a narrow wedge or manual test can prove the core claim.
5. **Forgetting the journey.** The final handoff must explain the path to the conclusion, not just present a polished endpoint.
6. **Treating lack of competitors as validation.** Check customer pain, existing spend, substitutes, distribution, and willingness to change behavior.

## Verification Checklist

Before concluding a brainstorm or delivering a final handoff, verify:

- [ ] The current thesis identifies a user, problem, and plausible first wedge.
- [ ] Material factual claims are sourced or labelled as assumptions.
- [ ] Direct competitors, substitutes, and adjacent options were considered where relevant.
- [ ] Rejected paths and decision rationale are preserved.
- [ ] The Shrimp Verdict is candid and includes the next test or reason to stop.
- [ ] The final spec, if requested, can be understood without access to the original conversation.
