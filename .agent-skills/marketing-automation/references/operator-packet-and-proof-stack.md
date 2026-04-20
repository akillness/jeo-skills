# Operator Packet and Proof Stack

Use this file when `marketing-automation` has already chosen the mode and lane and now needs the smallest packet that can survive real operator handoff.

## Core idea
A good marketing packet is not just tactics. It is the smallest artifact that names:
1. the owner,
2. what must happen next,
3. which approvals or dependencies can block delivery,
4. what proof will decide whether it worked.

This reflects how teams actually operate across docs, PM boards, CRM/lifecycle tools, analytics stacks, and launch trackers.

## Minimal operator packet

```markdown
## Operator packet
- Primary owner: ...
- Dependencies / approvals: design | analytics | engineering | legal | partner | none
- Required assets or inputs: ...
- Delivery horizon: immediate | this week | this month
```

### Guidance
- **Primary owner** — name the person or function that should carry the packet next.
- **Dependencies / approvals** — surface blockers early instead of hiding them in execution notes.
- **Required assets or inputs** — list only the inputs without which the packet cannot be actioned.
- **Delivery horizon** — make the packet usable for near-term coordination.

## Proof stack

```markdown
## Proof stack
- Primary KPI: ...
- Leading signal: ...
- Baseline or assumption: ...
- Success threshold: ...
- Readout window: ...
- Next owner / workflow: ...
```

### Guidance
- **Primary KPI** — one number that matters most now.
- **Leading signal** — the first credible signal before the KPI fully matures.
- **Baseline or assumption** — current state if known, otherwise the explicit assumption.
- **Success threshold** — the smallest improvement that counts as a win.
- **Readout window** — when the team should review results instead of leaving measurement vague.
- **Next owner / workflow** — who reads the proof next or which system owns the readout.

## Packet patterns by mode

### Launch orchestration
Use when the team needs one launch/growth brief.
- Owner often: PMM, growth lead, founder, launch owner
- Common dependencies: design, engineering, analytics, support, sales, partner teams
- Common proof stack: launch conversion KPI, early funnel movement, launch readout after first week or milestone review

### Conversion surface
Use when the team needs one page/flow brief or experiment packet.
- Owner often: CRO lead, PMM, copy owner, growth PM
- Common dependencies: designer, web owner, analytics, experimentation tooling
- Common proof stack: conversion rate, CTA clicks, form starts/completions, readout after enough traffic or one experiment window

### Lifecycle retention
Use when the team needs one lifecycle/journey packet.
- Owner often: lifecycle marketer, CRM owner, PMM, growth lead
- Common dependencies: analytics, product events, copy, email/notification tooling
- Common proof stack: activation or retained-usage KPI, early open/click/step-completion signal, readout after one lifecycle cycle

### Acquisition content
Use when the team needs one content/SEO brief.
- Owner often: SEO lead, content strategist, PMM
- Common dependencies: SME input, editor, designer, analytics/search tooling
- Common proof stack: organic sessions or qualified visits, impression/indexation signal, readout after indexing + early traffic window

### Measurement experiment
Use when the team needs one analytics or experiment packet.
- Owner often: analytics lead, growth PM, paid operator
- Common dependencies: event instrumentation, dashboard owner, engineering, media buyer
- Common proof stack: clean event coverage, tracked conversion, experiment cadence, readout tied to launch or experiment checkpoint

## Anti-patterns
- Do not output a packet with no named owner.
- Do not leave approvals or dependencies invisible when they obviously govern the timeline.
- Do not list ten KPIs; choose one KPI and one leading signal.
- Do not make readout timing implicit.
- Do not treat downstream tools as proof that routing is solved.
