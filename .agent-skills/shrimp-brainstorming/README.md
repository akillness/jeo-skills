# Shrimp Brainstorming

A research-led, user-led skill for turning vague project or business ideas into evidence-backed decisions and complete handoff specs.

It is designed for conversation that looks like this:

```text
A user brings a half-formed idea
→ the agent researches and pressure-tests it
→ the user asks questions, challenges findings, and redirects the inquiry
→ the idea becomes clearer through evidence and decisions
→ a final-spec.md records the journey and recommended next move
```

Unlike a rigid discovery interview, this skill does not force a question funnel. The user can steer the work at any point. The agent asks only the clarifying questions that genuinely prevent useful research.

## What it produces

For longer explorations, the skill recommends an idea folder:

```text
idea-name/
├── concept-brief.md
├── research-ledger.md
├── brainstorm.md        # Optional raw transcript
└── final-spec.md
```

`final-spec.md` is not only a final-state product spec. It is a clarified, self-contained record of the entire brainstorming process: original spark, research, pivots, decisions, rejected paths, uncertainty, and next actions.

## Install

Copy `SKILL.md` into the skills directory used by your agent platform. For Hermes Agent, a typical local install is:

```text
~/.hermes/skills/research/shrimp-brainstorming/SKILL.md
```

Also copy `templates/final-spec.md` if you want the included handoff template.

## Included concepts

- **Shrimp Verdict:** pursue, validate, or stop with a candid rationale.
- **Destination:** what the exploration is trying to make clear.
- **Decision frontier:** questions or tests worth resolving next.
- **Fog of war:** in-scope uncertainty not yet sharp enough to investigate.
- **Living record:** a recoverable trail of evidence and decisions.

## License

MIT
