# PM-Skills — Complete Plugin & Command Catalog

> Source: [phuryn/pm-skills](https://github.com/phuryn/pm-skills) · Version: 1.0.1 · License: MIT · Author: Paweł Huryn

---

## Overview

PM-Skills is a Claude Code plugin collection that operationalizes proven PM frameworks:

| Metric | Value |
|--------|-------|
| Total plugins | 8 |
| Total skills | 65 |
| Total commands | 36 |
| Frameworks encoded | Teresa Torres, Marty Cagan, Alberto Savoia, and more |

---

## Plugin 1: pm-product-discovery

**13 skills** — Continuous discovery, opportunity mapping, assumption testing

Encodes Teresa Torres's *Continuous Discovery Habits* framework with Opportunity Solution Trees (OST).

| Command | Description | Framework |
|---------|-------------|-----------|
| `/discover` | Start Opportunity Solution Tree mapping | Teresa Torres OST |
| `/map-assumptions` | Surface and categorize assumptions by risk | Assumption Mapping |
| `/run-experiment` | Design lightweight assumption test | Alberto Savoia Pretotyping |
| `/interview-guide` | Generate customer interview discussion guide | Continuous Discovery |
| `/jobs-to-be-done` | JTBD framework analysis for a use case | JTBD (Moesta/Christensen) |
| `/opportunity-score` | Score and prioritize opportunities (desirability × viability × feasibility) | OST Prioritization |
| `/assumption-test` | Create assumption card with test design | Testing Business Ideas |

### Key Concepts
- **Opportunity Solution Tree**: Desired outcome → Opportunities → Solutions → Experiments
- **Weak Opportunities**: Problems with high frequency, high dissatisfaction, or underserved needs
- **Assumption Mapping**: 2×2 grid (importance × knowledge) to identify what to test first
- **Continuous Discovery**: Weekly customer touchpoints, not quarterly research projects

---

## Plugin 2: pm-product-strategy

**12 skills** — Vision, north star, OKRs, strategic bets

Encodes Marty Cagan's SVPG principles + OKR frameworks.

| Command | Description | Framework |
|---------|-------------|-----------|
| `/north-star` | Define north star metric + 3-5 input metrics | North Star Framework |
| `/vision` | Write 3-year product vision statement | Geoffrey Moore Vision |
| `/strategy` | Build strategic pillars and bets | Richard Rumelt Good Strategy |
| `/okrs` | Generate product OKRs (1 objective + 3 KRs) | OKR (Doerr) |
| `/business-model` | Complete Business Model Canvas | Osterwalder BMC |
| `/competitive-moat` | Define defensibility and moat sources | Hamilton Helmer 7 Powers |
| `/strategic-narrative` | Stakeholder-facing strategy story | Marty Cagan Inspired |

### Key Concepts
- **North Star Metric**: The single metric that best captures delivered customer value
- **Input Metrics**: Leading indicators that drive the north star (2-6 metrics)
- **7 Powers**: Scale economies, network effects, counter-positioning, switching costs, branding, cornered resource, process power
- **Outcome Roadmap**: Organize by outcomes (north star progress), not features

---

## Plugin 3: pm-execution

**15 skills** — PRD, user stories, sprint planning, backlog

| Command | Description | Framework |
|---------|-------------|-----------|
| `/write-prd` | Full PRD: context, goals, user stories, requirements, success metrics | PM Best Practices |
| `/write-stories` | User stories with acceptance criteria (Given/When/Then) | Agile/BDD |
| `/sprint` | Sprint planning: goal, capacity, backlog selection | Scrum |
| `/backlog` | Backlog prioritization using RICE or ICE | RICE/ICE Scoring |
| `/roadmap` | Quarterly outcome-based roadmap | Marty Cagan |
| `/retro` | Sprint retrospective with action items | Agile Retrospectives |
| `/acceptance-criteria` | Write acceptance criteria for a feature | BDD |
| `/spec` | Technical specification for engineering | RFC |

### PRD Structure (from `/write-prd`)
```
1. Executive Summary
2. Problem Statement
3. User Personas & JTBD
4. Goals & Non-Goals
5. User Stories
6. Functional Requirements
7. Non-Functional Requirements
8. Success Metrics
9. Launch Plan
10. Open Questions
```

### RICE Scoring Formula
```
RICE = (Reach × Impact × Confidence) / Effort

Reach:      Users affected per time period
Impact:     3 (massive) / 2 (high) / 1 (medium) / 0.5 (low) / 0.25 (minimal)
Confidence: 100% / 80% / 50% (known risk)
Effort:     Person-months
```

---

## Plugin 4: pm-market-research

**7 skills** — Customer research, competitive analysis, personas

| Command | Description | Framework |
|---------|-------------|-----------|
| `/persona` | Create detailed user persona with goals, pains, behaviors | Nielsen Persona |
| `/competitive-analysis` | Feature matrix + positioning map + strategic implications | Porter Five Forces |
| `/market-sizing` | TAM/SAM/SOM calculation with methodology | VC Market Sizing |
| `/survey` | Customer survey design with question types and analysis plan | Survey Methodology |
| `/win-loss` | Win/loss interview analysis framework | Win-Loss Analysis |
| `/churn-analysis` | Churn root cause analysis guide | Retention Analysis |

### Persona Template (from `/persona`)
```
Name:         [Persona name + archetype]
Demographics: Age, role, company size, tech savvy
Goals:        Top 3 goals (professional + personal)
Pains:        Top 3 frustrations with current solution
Behaviors:    Tools used, channels, decision process
JTBD:         "When [situation], I want to [motivation], so I can [outcome]"
Quote:        Representative verbatim from research
```

---

## Plugin 5: pm-data-analytics

**3 skills** — Metrics, funnels, experimentation

| Command | Description | Framework |
|---------|-------------|-----------|
| `/metrics-framework` | Define full product metrics hierarchy | AARRR / HEART |
| `/funnel-analysis` | Map and analyze conversion funnel | Funnel Analysis |
| `/ab-test-guide` | A/B test design: hypothesis, sample size, duration, analysis | Statistical Testing |

### Metrics Frameworks
- **AARRR (Pirate Metrics)**: Acquisition → Activation → Retention → Referral → Revenue
- **HEART (Google)**: Happiness, Engagement, Adoption, Retention, Task Success
- **Input/Output Metrics**: Leading indicators vs. lagging outcomes

### A/B Test Design (from `/ab-test-guide`)
```
Hypothesis:     "Changing X will increase Y by Z% because [mechanism]"
Primary metric: [Single success metric]
Guardrail metrics: [Metrics that must not degrade]
Sample size:    [Calculator output — never underpowered]
Duration:       [Minimum 2 business cycles, avoid novelty effect]
Analysis:       [Pre-registered, no peeking until completion]
```

---

## Plugin 6: pm-go-to-market

**6 skills** — Launch planning, positioning, pricing, channels

| Command | Description | Framework |
|---------|-------------|-----------|
| `/plan-launch` | Full GTM launch plan with phases, stakeholders, metrics | GTM Framework |
| `/positioning` | Product positioning statement (Category × Target × Differentiator) | April Dunford Positioning |
| `/pricing` | Pricing strategy framework (model, anchor, packaging) | Price Intelligently |
| `/channel-strategy` | Distribution channel selection and ranking | GTM Channel Model |
| `/launch-checklist` | Pre-launch / launch day / post-launch checklist | Product Launch |
| `/press-release` | Amazon-style working backward PR/FAQ | Amazon PRFAQ |

### Positioning Statement (from `/positioning`)
```
For [target customer segment]
Who [have this pain/need]
[Product name] is a [category]
That [key benefit / differentiation]
Unlike [primary alternative]
Our product [reason to believe]
```

### GTM Launch Phases (from `/plan-launch`)
```
Phase 1 - Pre-launch (T-6 weeks):  Enablement, beta, content creation
Phase 2 - Launch (T-0):            Announcement, PR, coordinated release
Phase 3 - Post-launch (T+4 weeks): Monitoring, iteration, learnings
```

---

## Plugin 7: pm-marketing-growth

**5 skills** — Growth loops, retention, activation

| Command | Description | Framework |
|---------|-------------|-----------|
| `/growth-loops` | Identify and design viral/retention growth loops | Reforge Growth |
| `/retention-playbook` | D1/D7/D30 retention intervention framework | Retention Framework |
| `/activation` | User activation journey design (aha moment mapping) | Activation Design |
| `/referral-program` | Referral program design (incentive, mechanics, tracking) | Referral Framework |
| `/growth-model` | Build simple growth model (levers, inputs, outputs) | Growth Accounting |

### Growth Loop Types
- **Viral Loop**: User action → invite → new user → repeat
- **Content Loop**: User creates content → SEO/social → new user → creates content
- **Paid Loop**: Revenue → ads → new user → revenue
- **Product Loop**: Usage → value → network effect → more usage

---

## Plugin 8: pm-toolkit

**4 skills** — Communication, templates, facilitation

| Command | Description | Framework |
|---------|-------------|-----------|
| `/stakeholder-update` | Structured stakeholder status update | PM Communication |
| `/meeting-agenda` | PM meeting agenda templates | Facilitation |
| `/pm-templates` | Access library of PM template files | Template Library |
| `/decision-log` | Decision log with context, options, rationale | Decision Framework |

### Stakeholder Update Format (from `/stakeholder-update`)
```
Status: 🟢 On Track / 🟡 At Risk / 🔴 Blocked
Summary: [2-3 sentence executive summary]
Key Updates: [Bullet list of major progress]
Metrics: [Key metric changes this period]
Risks: [Active risks with mitigation]
Next Steps: [Top 3 next actions with owners]
Help Needed: [Specific asks from stakeholders]
```

---

## Full Command Reference

| Plugin | Command | Shorthand | Description |
|--------|---------|-----------|-------------|
| pm-product-discovery | `/discover` | `/disc` | Opportunity Solution Tree |
| pm-product-discovery | `/map-assumptions` | `/assume` | Assumption mapping |
| pm-product-discovery | `/run-experiment` | `/exp` | Design assumption test |
| pm-product-discovery | `/interview-guide` | `/interview` | Customer interview guide |
| pm-product-discovery | `/jobs-to-be-done` | `/jtbd` | JTBD framework |
| pm-product-discovery | `/opportunity-score` | `/score` | Score opportunities |
| pm-product-strategy | `/north-star` | `/ns` | North star metric |
| pm-product-strategy | `/vision` | `/vis` | Product vision |
| pm-product-strategy | `/strategy` | `/strat` | Strategic pillars |
| pm-product-strategy | `/okrs` | `/okr` | OKR generation |
| pm-product-strategy | `/business-model` | `/bmc` | Business model canvas |
| pm-execution | `/write-prd` | `/prd` | Full PRD |
| pm-execution | `/write-stories` | `/stories` | User stories |
| pm-execution | `/sprint` | `/sprint` | Sprint planning |
| pm-execution | `/backlog` | `/bl` | Backlog prioritization |
| pm-execution | `/roadmap` | `/rm` | Quarterly roadmap |
| pm-execution | `/retro` | `/retro` | Sprint retrospective |
| pm-market-research | `/persona` | `/p` | User persona |
| pm-market-research | `/competitive-analysis` | `/comp` | Competitive analysis |
| pm-market-research | `/market-sizing` | `/tam` | TAM/SAM/SOM |
| pm-data-analytics | `/metrics-framework` | `/metrics` | Metrics hierarchy |
| pm-data-analytics | `/funnel-analysis` | `/funnel` | Funnel analysis |
| pm-data-analytics | `/ab-test-guide` | `/ab` | A/B test design |
| pm-go-to-market | `/plan-launch` | `/launch` | GTM launch plan |
| pm-go-to-market | `/positioning` | `/pos` | Positioning statement |
| pm-go-to-market | `/pricing` | `/price` | Pricing strategy |
| pm-marketing-growth | `/growth-loops` | `/loops` | Growth loop design |
| pm-marketing-growth | `/retention-playbook` | `/retain` | Retention framework |
| pm-marketing-growth | `/activation` | `/activate` | Activation design |
| pm-toolkit | `/stakeholder-update` | `/update` | Stakeholder update |
| pm-toolkit | `/meeting-agenda` | `/agenda` | Meeting agendas |
| pm-toolkit | `/pm-templates` | `/tmpl` | Template library |

---

## Thought Leaders Encoded

| Author | Book/Framework | Commands |
|--------|---------------|----------|
| Teresa Torres | Continuous Discovery Habits | `/discover`, `/interview-guide`, `/map-assumptions` |
| Marty Cagan | Inspired, Empowered | `/north-star`, `/strategy`, `/vision`, `/roadmap` |
| Alberto Savoia | The Right It (Pretotyping) | `/run-experiment`, `/assumption-test` |
| Alexander Osterwalder | Business Model Generation | `/business-model` |
| April Dunford | Obviously Awesome | `/positioning` |
| Hamilton Helmer | 7 Powers | `/competitive-moat` |
| Bob Moesta | Demand-Side Sales | `/jobs-to-be-done` |
| John Doerr | Measure What Matters | `/okrs` |
| Reforge | Growth Frameworks | `/growth-loops`, `/retention-playbook` |

---

## Version Notes

- **Current**: 1.0.1
- **Platform**: Claude Code plugins
- **Author**: Paweł Huryn (@phuryn)
- **License**: MIT
- **Repo**: https://github.com/phuryn/pm-skills
