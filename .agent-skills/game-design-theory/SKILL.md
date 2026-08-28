---
name: game-design-theory
description: >
  Turn a game-design question into one falsifiable theory packet instead of a
  framework collage. Use when a designer must explain why a mechanic may create
  a player experience, analyze mechanics-dynamics-aesthetics, test a core loop,
  inspect choice, uncertainty, progression, resource flow, mastery, autonomy,
  competence, or relatedness, compare design variants, or turn conflicting
  playtest interpretations into a bounded prototype. Choose one primary lens,
  state its limits, separate observation from assumption, map the causal chain,
  define counterevidence, and validate `game-design-hypothesis.json`. Triggers on:
  game design theory, MDA, mechanics dynamics aesthetics, player motivation,
  core loop theory, dominant strategy, reward loop, flow, Bartle types, fun
  analysis, design hypothesis, or why this mechanic works.
allowed-tools: Bash Read Write Edit Glob Grep WebFetch
compatibility: >
  Engine-neutral analysis. The bundled validator is read-only, Python
  3.9-compatible, and uses only the standard library.
metadata:
  version: "1.0"
  source: akillness/jeo-skills
---

# Game Design Theory

Use theory as a lens that makes a design claim testable. Do not use it as a substitute for
player evidence, a universal recipe for fun, or a reason to turn one taxonomy into permanent
player labels.

## When to use this skill

Use it to:

- trace a mechanic through runtime behavior to a desired player experience;
- explain a weak, confusing, dominant, shallow, or conflicting game system;
- choose between two design variants before full implementation;
- analyze a core loop, progression, reward, resource, uncertainty, or mastery structure;
- frame motivation as a hypothesis about autonomy, competence, or relatedness;
- reconcile playtest observations that support different explanations;
- define the smallest prototype that could disprove a design belief.

Do not use it to write a full GDD, run production, tune moment-to-moment feedback, design a
HUD, or implement an engine system. Route those to `bmad-gds`, `game-studio-harness`,
`game-feel`, `game-ui-ux`, or the narrowest engine skill.

## Instructions

### 1. Freeze one design question

Write the decision in a form that can change:

- What player behavior or experience is observed?
- What evidence exists, from whom, in which build and context?
- What design variable is under the team's control?
- What decision will the result unlock?
- What remains outside scope?

Separate direct observations, player reports, telemetry, implementation facts, and designer
assumptions. Do not begin with a preferred framework and force the evidence into it.

### 2. Choose one primary lens

Use the smallest lens that explains the question:

- **MDA:** translate mechanics into runtime dynamics and intended or observed aesthetics;
- **motivation needs:** treat autonomy, competence, and relatedness as hypotheses about a
  specific context, not mandatory ingredients or universal player scores;
- **decision structure:** inspect information, options, tradeoffs, uncertainty, and consequences;
- **feedback/resource loops:** inspect reinforcing and balancing loops, sources, sinks, and
  delayed effects;
- **learning/mastery:** inspect what the player can perceive, practice, predict, and combine.

A secondary lens is allowed only when it changes the experiment. Name each lens's blind spots.
Do not apply Bartle's MUD-derived player types as a universal segmentation system. Use them
only when the multiplayer context and evidence make that limited comparison relevant.

### 3. Build a causal chain

For every claim, write:

`mechanic -> player/system interaction -> runtime dynamic -> perceived signal -> experience`

Mark every unsupported arrow as an assumption. A mechanic can produce multiple dynamics, and
players can interpret the same dynamic differently. "This is fun" is not a causal chain.

For a resource or progression system, also map sources, sinks, stock, conversion, gates, and
feedback direction. For a choice system, map visible information, alternatives, costs,
reversibility, delayed consequences, and whether one option dominates across relevant states.

### 4. State the falsifier

A useful hypothesis names evidence that would make the team reject or revise it. Include:

- the proposed change;
- the expected observable signal;
- a plausible competing explanation;
- the counterevidence or failure signature;
- what must remain unchanged to isolate the variable.

Do not use retention, session length, or spend alone as a proxy for a desired experience.
Pair behavioral measures with qualitative evidence and the ethical cost of the intervention.

### 5. Design the smallest comparison

Prefer a reversible prototype or data/config variant over a production system. Keep the
control and variant identical except for the intended variable. Use the real target device,
input method, and player context when those can change the result.

Do not invent a universal sample size, difficulty curve, reward ratio, feedback time, or
engagement target. The study owner must derive evidence sufficiency and decision thresholds
from the risk and population.

### 6. Interpret evidence conservatively

Report what was observed before explaining why. Check implementation integrity, exposure to
the intended variant, order/learning effects, prior familiarity, accessibility barriers, and
confounds. A failed prototype can reject one implementation without rejecting the entire
lens.

Keep minority and contradictory responses visible. Do not average away a barrier that blocks
a meaningful player group.

### 7. Write and validate the contract

From this skill directory, copy `references/hypothesis-example.json`, replace its example
content, and run:

```bash
python3 scripts/validate-design-hypothesis.py game-design-hypothesis.json
python3 scripts/validate-design-hypothesis.py --self-test
```

The validator checks the question, evidence boundary, lens and limitation, causal chain,
falsifiable hypotheses, controlled prototype, evidence plan, ethics, and unresolved
placeholders. It does not decide whether the theory is true.

Return:

```markdown
### Game design theory packet
- Design question: <one decision>
- Primary lens: <lens and why>
- Causal chain: <mechanic to observed or intended experience>
- Weakest assumption: <unsupported arrow>
- Falsifier: <evidence that changes the claim>
- Prototype: <control, variant, unchanged factors>
- Evidence decision: <keep, revise, reject, or inconclusive>
- Next owner: <prototype, production, feel, UI, balance, or research route>
```

## Examples

### Players ignore one combat option

Use decision structure and runtime dynamics. Check whether information, cost, timing, or enemy
states make another option dominant. Compare one reversible variant and define evidence that
would preserve the original explanation versus reveal an onboarding problem.

### "Our players are Achievers"

Do not turn a small survey or Bartle label into a universal segment. Restate the concrete
behavior and context, then test the actual design need using choice, mastery, social, or
progression evidence.

### Full game production request

Route to `bmad-gds` or `game-studio-harness`. Use this skill only for the bounded theoretical
question inside that production flow.

## Best practices

1. Start from one decision and observed evidence, not a favorite framework.
2. Mark every causal jump that lacks evidence.
3. Use one primary lens and state what it cannot explain.
4. Define counterevidence before running the prototype.
5. Isolate one reversible design variable at a time.
6. Pair behavioral and qualitative evidence.
7. Avoid universal player types, magic ratios, or engagement targets.
8. Keep ethical risks, accessibility barriers, and contradictory evidence visible.
9. Route production, implementation, feel, UI, and telemetry to their actual owners.

## References

- `references/framework-boundaries.md`: MDA, motivation, decision, loop, and taxonomy limits.
- `references/hypothesis-example.json`: complete validator-accepted example.
- `references/source-notes.md`: primary and upstream claim ledger.
- `scripts/validate-design-hypothesis.py`: read-only Python 3.9+ validator.
