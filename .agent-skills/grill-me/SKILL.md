---
name: grill-me
description: >
  Conduct a comprehensive plan or design stress-test through systematic questioning.
  Interviews relentlessly about every decision point, resolves interdependencies
  progressively, and traverses the complete decision tree. Use when thoroughly
  vetting a proposal, design, or architecture before committing to it.
allowed-tools: Read Grep Glob Bash Write Edit
compatibility: >
  Works for any plan, design, or architectural proposal. Pairs with grill-with-docs
  when domain documentation should be updated during the session, and with to-issues
  when the vetted plan should be converted to tickets.
metadata:
  tags: design-review, stress-testing, planning, architecture, questioning, validation
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "1.0"
  source: mattpocock/skills
---

# Grill Me

Thoroughly vet plans and designs through systematic, relentless questioning.

## When to use this skill

- Before committing to an architectural decision
- When a design feels right but hasn't been challenged
- Stress-testing assumptions before implementation begins
- Exploring edge cases and failure modes in a proposal

## When not to use this skill

- Quick clarifying questions → just ask directly
- Validating against domain docs → use `grill-with-docs`
- Writing implementation tickets → use `to-issues`

## Process

Interview relentlessly about every aspect of the plan until shared understanding is reached. Walk down each branch of the decision tree, resolving dependencies between decisions one by one.

**Rules:**
- Ask one question at a time
- Wait for feedback before continuing
- Provide a recommended answer with each question
- Explore the codebase instead of asking when the answer is findable there
- Keep going until all branches of the decision tree are resolved

## What gets covered

The grilling session explores:

- **Why this approach?** — What alternatives were considered and rejected?
- **What breaks first?** — Edge cases, failure modes, error states
- **What are the dependencies?** — What must be true for this to work?
- **What changes later?** — Which parts are likely to evolve?
- **What can't change?** — Which decisions are load-bearing and hard to reverse?
- **Who is affected?** — Callers, consumers, downstream systems

## Output

By the end of the session:
- Every major decision point has been examined
- Dependencies between decisions have been resolved in order
- Remaining open questions are documented
- Shared understanding exists about trade-offs made

## Activation

User says: "grill me", "stress-test this plan", "challenge my design", "ask me hard questions about this"
