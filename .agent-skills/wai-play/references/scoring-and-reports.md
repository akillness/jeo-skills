# Scoring, evidence, and report reading

WAI Play scores the **game**. It reports harness health separately so a weak
integration never silently becomes a bad review of the game.

## The five dimensions

| Key | Dimension | Weight | Scores |
|---|---|---|---|
| `task_flow` | Core flow and completeness | 0.24 | Whether the flow is complete, reachable, recoverable |
| `gameplay` | Core gameplay soundness | 0.26 | Loop, rules, challenge, growth, strategy, pacing |
| `ui_quality` | UI and visual presentation | 0.20 | Readability, hierarchy, discoverability, layout, stability |
| `feedback` | Control feel and feedback | 0.15 | Player-observable response only |
| `technical_quality` | Stability and performance | 0.15 | Runtime errors, frame stability, latency, loading |

Two exclusions are explicit upstream and worth repeating in any summary:

- **Agent operator error does not cost the game points** under `task_flow`.
- **API integration completeness does not score** under `technical_quality`.

### Per-criterion weights

**task_flow** — core flow closure .25 · key node triggering .18 · state
transition .15 · goal clarity .12 · failure & retry .12 · startup/entry .10 ·
content completeness .08

**gameplay** — core loop .25 · rule consistency .15 · control response .15 ·
challenge curve .15 · reward & growth .12 · strategy value .10 · repetition
& pacing .08

**ui_quality** — readability .18 · entry discoverability .18 · state
feedback .18 · hierarchy .15 · layout & occlusion .12 · visual consistency
.12 · frame stability .07

**feedback** — input response .25 · visible state change .25 · success/error
feedback .20 · damage & reward feedback .15 · result & recovery feedback .15

**technical_quality** — runtime stability .30 · performance smoothness .25 ·
input latency .15 · resource loading .15 · state consistency .15

## The visibility rule

`feedback` is scored only from what a player can see or hear, or what a
reviewer can confirm from the recorded clip. An internal API value changing is
**not sufficient** for a high feedback score. A game whose HP field decrements
with no visible hit reaction should lose feedback points even though the state
delta is clean.

## Rating bands

| Band | Meaning |
|---|---|
| 0.0–0.9 | Core content missing or essentially unusable |
| 1.0–1.9 | Severe blockers; the flow cannot be completed smoothly |
| 2.0–2.9 | Basics work, but gameplay / UI / feedback / stability are clearly lacking |
| 3.0–3.4 | Core experience complete and stable, with noticeable remaining issues |
| 3.5–4.4 | High completion; main experience polished, few issues left |
| 4.5–5.0 | Near release quality; evidence is thorough and stable across repeats |

Do not award 4.5+ off a single run. That band asserts repeat stability.

## Problem cards

Each distinct problem appears **once**, bound to the evidence from the single
best attempt:

- the state change that demonstrates it (from the type's `evidence_state_fields`)
- a screenshot, or a clip of at most 20 seconds
- what is wrong, what to change, and how to verify the fix afterwards

Reporting the same defect once per occurrence inflates severity and buries the
distinct issues. Merge, then rank.

## Test credibility diagnostics

Shown alongside the score, never folded into it:

- **API integration** — which contract methods were present and usable
- **Evidence completeness** — whether state, screenshots, and clips were captured
- **Agent operation reliability** — whether the agent could actually drive the game

Read these first. Low scores with poor credibility diagnostics mean fix the
harness and re-run; low scores with clean diagnostics mean fix the game.

## Reporting checklist

1. State the mode and the game type used (including any closest-fit caveat).
2. Give the weighted total plus the five dimension scores.
3. Give the credibility diagnostics separately, in the same summary.
4. List merged problem cards, ranked, each with its single evidence set.
5. State degradation explicitly — no keys, no source ZIP, single run, or a
   key node that was never reached — instead of letting a confident-looking
   number imply coverage that did not happen.
