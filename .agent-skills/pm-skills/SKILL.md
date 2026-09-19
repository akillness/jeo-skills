---
name: pm-skills
description: >
  AI operating system for product managers — 65 skills, 36 commands across 8 plugins
  encoding PM frameworks by Teresa Torres, Marty Cagan, Alberto Savoia, and other PM
  thought leaders. Use when doing product discovery, writing PRDs, defining strategy,
  conducting user research, planning go-to-market, running data analytics, or managing
  sprints. Triggers on: pm-skills, product manager, product discovery, write PRD, user
  story mapping, product strategy, north star metric, opportunity solution tree, sprint
  planning, go-to-market, market research, product roadmap, pretotyping, jobs to be done.
license: MIT
compatibility: >
  Works on all platforms. Install via `npx skills add pm-skills` (cross-platform) or
  via the Claude Code marketplace. No external dependencies needed — all skills run as
  Claude Code plugins. Optional: any Claude-compatible CLI for additional agent routing.
metadata:
  version: "1.0"
  source: phuryn/pm-skills
  tags: product-management, product-discovery, prd, strategy, go-to-market, user-research, analytics, agile
allowed-tools: Bash Read Write Edit Glob Grep WebFetch WebSearch
---

# PM-Skills — AI OS for Product Managers

> *"65 skills, 36 commands, 8 plugins — encoding the best PM frameworks into AI."*

PM-Skills is an AI operating system for product managers built as Claude Code plugins.
It encodes the best PM methodologies from Teresa Torres (Opportunity Solution Trees),
Marty Cagan (SVPG), Alberto Savoia (Pretotyping), and other thought leaders into
structured AI skills ready to drive real product work.

## When to use this skill

- Writing user stories, PRDs, or product specs from scratch
- Running product discovery (opportunity mapping, assumption testing)
- Defining product strategy (north star, vision, OKRs)
- Planning and executing go-to-market launches
- Conducting market research and competitive analysis
- Setting up sprint planning, backlog grooming, or retrospectives
- Analyzing data to extract product insights
- Pretotyping and validating ideas before building

## 8 Plugins

| Plugin | Skills | Core Focus |
|--------|--------|------------|
| `pm-product-discovery` | 13 skills | Teresa Torres OST, opportunity mapping, assumption testing |
| `pm-product-strategy` | 12 skills | Vision, north star, OKRs, business model, competitive moat |
| `pm-execution` | 15 skills | PRD writing, user stories, sprint planning, backlog grooming |
| `pm-market-research` | 7 skills | Customer interviews, JTBD, competitive analysis, persona creation |
| `pm-data-analytics` | 3 skills | Metrics framework, funnel analysis, A/B testing guide |
| `pm-go-to-market` | 6 skills | Launch planning, positioning, pricing, channel strategy |
| `pm-marketing-growth` | 5 skills | Growth loops, retention frameworks, activation playbook |
| `pm-toolkit` | 4 skills | Stakeholder communication, meeting facilitation, PM templates |

## Instructions

Invoke this skill by mentioning a PM task or using any of the slash commands below.
The skill routes your request to the appropriate plugin and framework automatically.

1. Describe your product challenge in natural language, or use a slash command directly.
2. The skill selects the relevant PM framework (OST, JTBD, Pretotyping, etc.) and guides you through it.
3. Output is structured and ready to paste into Notion, Jira, or your doc tool of choice.

Start with `/discover` for new features, `/write-prd` for specs, or `/north-star` for strategy.

## Installation

### Option A: Claude Marketplace (recommended)

```bash
# Step 1: Add the skill collection
claude plugin marketplace add phuryn/pm-skills

# Step 2: Install individual plugins (repeat for each you need)
claude plugin install pm-product-discovery@pm-skills
claude plugin install pm-product-strategy@pm-skills
claude plugin install pm-execution@pm-skills
claude plugin install pm-market-research@pm-skills
claude plugin install pm-data-analytics@pm-skills
claude plugin install pm-go-to-market@pm-skills
claude plugin install pm-marketing-growth@pm-skills
claude plugin install pm-toolkit@pm-skills

# Step 3: Verify installation
claude plugin list
```

### Option B: Manual installation

```bash
# Clone the repository
git clone https://github.com/phuryn/pm-skills
cd pm-skills

# Copy SKILL.md files to Claude's skills directory
# (adjust path to your Claude Code skills directory)
cp -r plugins/pm-product-discovery ~/.claude/skills/
cp -r plugins/pm-product-strategy ~/.claude/skills/
cp -r plugins/pm-execution ~/.claude/skills/
cp -r plugins/pm-market-research ~/.claude/skills/
cp -r plugins/pm-data-analytics ~/.claude/skills/
cp -r plugins/pm-go-to-market ~/.claude/skills/
cp -r plugins/pm-marketing-growth ~/.claude/skills/
cp -r plugins/pm-toolkit ~/.claude/skills/
```

## Quick Start

```
# Run a key command directly
/discover          # Start opportunity mapping with Teresa Torres OST
/write-prd         # Generate a structured PRD
/north-star        # Define your product's north star metric
/strategy          # Build product strategy framework
/plan-launch       # Create a go-to-market launch plan
/sprint            # Plan current sprint
/write-stories     # Convert features into user stories
/business-model    # Map business model canvas
```

## Key Commands by Plugin

### pm-product-discovery
```
/discover                # Opportunity solution tree mapping
/map-assumptions         # Assumption mapping and testing
/run-experiment          # Design assumption experiment
/interview-guide         # Generate customer interview guide
/jobs-to-be-done         # JTBD framework analysis
/opportunity-score       # Score and prioritize opportunities
```

### pm-product-strategy
```
/north-star              # Define north star metric + input metrics
/vision                  # Write product vision statement
/strategy                # Build strategic pillars and bets
/okrs                    # Generate product OKRs
/business-model          # Business model canvas
/competitive-moat        # Define defensibility and moat
```

### pm-execution
```
/write-prd               # Full PRD with context, goals, requirements
/write-stories           # User stories with acceptance criteria
/sprint                  # Sprint planning with capacity
/backlog                 # Backlog prioritization (RICE/ICE)
/roadmap                 # Quarterly roadmap creation
/retro                   # Sprint retrospective facilitation
```

### pm-market-research
```
/persona                 # Create detailed user persona
/competitive-analysis    # Competitor feature/positioning analysis
/market-sizing           # TAM/SAM/SOM calculation
/survey                  # Customer survey design
```

### pm-data-analytics
```
/metrics-framework       # Define product metrics hierarchy
/funnel-analysis         # Conversion funnel mapping
/ab-test-guide           # A/B test design and analysis guide
```

### pm-go-to-market
```
/plan-launch             # Full GTM launch plan
/positioning             # Product positioning statement
/pricing                 # Pricing strategy framework
/channel-strategy        # Distribution channel selection
```

### pm-marketing-growth
```
/growth-loops            # Identify viral/retention growth loops
/retention-playbook      # D1/D7/D30 retention framework
/activation              # User activation journey design
```

### pm-toolkit
```
/stakeholder-update      # Structured stakeholder communication
/meeting-agenda          # PM meeting agenda templates
/pm-templates            # Access PM template library
```

## Core Frameworks Encoded

### Opportunity Solution Tree (Teresa Torres)
PM-Skills encodes Teresa Torres's continuous discovery framework:
1. **Desired Outcome** → Define the north star and business outcome
2. **Opportunities** → Map customer problems, needs, desires (the "why")
3. **Solutions** → Brainstorm solutions per opportunity (the "what")
4. **Experiments** → Design assumption tests (the "how to validate")

Use `/discover` to start the tree interactively.

### Inspired / Empowered (Marty Cagan)
Strategy and execution principles from SVPG:
- Outcome-based roadmaps, not feature lists
- Product trio: PM + Designer + Engineer in discovery
- Distinguish discovery risk from delivery risk

### Pretotyping (Alberto Savoia)
Validate demand before building:
- Use `/run-experiment` to design lightweight experiments
- Mechanical Turk, Impersonator, Pretend-to-Own patterns
- "Make sure you are building the right IT before you build IT right"

## Workflow Example: New Feature Discovery

```bash
# 1. Start opportunity mapping
/discover "reduce user churn"

# 2. Run customer interviews to validate opportunities
/interview-guide "churned users"

# 3. Score and prioritize the best opportunity
/opportunity-score

# 4. Design assumption tests before building
/run-experiment "users want async collaboration"

# 5. Write the PRD once assumptions are validated
/write-prd "async collaboration feature"

# 6. Break into user stories
/write-stories

# 7. Plan the sprint
/sprint
```

## Best practices

- **Discovery before execution**: Always run `/discover` before writing PRDs
- **JTBD framing**: Frame requirements with `/jobs-to-be-done` to stay customer-centric
- **Assumption-first**: Use `/map-assumptions` to surface risks before committing
- **Outcome-based roadmap**: Define `/north-star` before building `/roadmap`
- **Continuous discovery**: Schedule `/interview-guide` regularly, not just at project start

## Framework Selection Guide

| Situation | Recommended Command | Framework |
|-----------|---------------------|-----------|
| "What should we build?" | `/discover` | Teresa Torres OST |
| "Is there demand for this?" | `/run-experiment` | Alberto Savoia Pretotyping |
| "How do we measure success?" | `/north-star` | Marty Cagan North Star |
| "What's the business model?" | `/business-model` | Business Model Canvas |
| "How do we grow?" | `/growth-loops` | Growth Loops |
| "What are customers doing?" | `/jobs-to-be-done` | JTBD (Moesta) |
| "What are our risks?" | `/map-assumptions` | Assumption Mapping |

## References

- Source repository: https://github.com/phuryn/pm-skills
- Teresa Torres — Continuous Discovery Habits: https://www.producttalk.org
- Marty Cagan — SVPG Inspired/Empowered: https://www.svpg.com
- Alberto Savoia — Pretotyping: https://www.pretotyping.org
