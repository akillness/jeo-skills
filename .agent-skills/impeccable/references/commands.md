# Command router

Pinned to `pbakaus/impeccable` skill 4.8.0 at `02523aec3e4c4580102d996d1b6a71fbe062e03f`.
The 24 rows match the upstream `SKILL.src.md` Commands table and
`scripts/command-metadata.json`; [`source.json`](source.json) records the same list.
Descriptions here are this operator's summaries. In engine mode, the installed upstream
playbook (`<upstream-skill>/reference/<command>.md`) is authoritative.

Invoke as `/impeccable <command> <target>` (`$impeccable` on Codex). A narrow target, one
component or one section, gets a better result than a whole site.

## Picking the command

| The user says | Command | Not this |
|---|---|---|
| "plan this before we build", "what should this screen do" | `shape` | `craft` (deprecated alias) |
| "set up impeccable", "capture our product context" | `init` (alias `teach`) | `document` |
| "write down our design system", "make a DESIGN.md" | `document` | `init` |
| "pull these into tokens/components", "too much drift" | `extract` | `polish` |
| "review this design", "what's wrong with this page" | `critique` | `audit` |
| "accessibility/perf check", "technical quality report" | `audit` | `critique` |
| "final pass before launch", "something looks off" | `polish` | `bolder` |
| "too safe", "bland", "generic" | `bolder` | `overdrive` |
| "too loud", "garish", "overwhelming" | `quieter` | `distill` |
| "too much stuff", "declutter" | `distill` | `quieter` |
| "edge cases, errors, i18n, overflow" | `harden` | `clarify` |
| "first run", "empty state", "activation" | `onboard` | `clarify` |
| "add motion/transitions/micro-interactions" | `animate` | `delight` |
| "it's all gray", "needs color" | `colorize` | `bolder` |
| "fonts", "type hierarchy", "readability" | `typeset` | `layout` |
| "spacing", "rhythm", "alignment", "crowded" | `layout` | `typeset` |
| "personality", "make it fun/memorable" | `delight` | `animate` |
| "wow me", "shaders", "spring physics", "scroll-driven" | `overdrive` | `bolder` |
| "confusing copy/labels/errors" | `clarify` | `harden` |
| "mobile", "breakpoints", "tablet", "print" | `adapt` | `layout` |
| "slow", "janky", "bundle size" | `optimize` | `animate` |
| "let me pick an element and try variants" | `live` | `generate` |
| "give me 3 bold variants of the pricing cards" | `generate` | `live` |

If two commands genuinely fit, ask once. A bare `/impeccable` shows a short context-aware
menu (two or three recommended commands, each with a reason) and never auto-runs anything.

## Rows

| Command | Category | Arguments | Owns | Writes or needs |
|---|---|---|---|---|
| `craft` | Build | `[feature]` | Deprecated alias for an ordinary new-work request; adds no behavior | Same as a plain build request |
| `shape` | Build | `[feature]` | Short discovery interview, then a user-confirmed design brief; no code | Brief only; enters new-work for visual-world decisions |
| `init` | Build | none | Durable product truth: users, positioning, constraints, platform, stack | Writes `PRODUCT.md`; may write `.impeccable/live/config.json` for runnable web projects; never writes `DESIGN.md` |
| `document` | Build | none | Records the incumbent visual system from code | Writes `DESIGN.md` (Google DESIGN.md format: YAML tokens plus fixed sections) and the `.impeccable/design.json` sidecar |
| `extract` | Build | `[target]` | Consolidates repeated values and patterns into tokens and shared components | Edits design-system files |
| `critique` | Evaluate | `[area]` | Scored UX review with independent design and detector assessments | Report in chat; snapshot in `.impeccable/critique/` |
| `audit` | Evaluate | `[area]` | Technical quality across accessibility, performance, theming, responsive, implementation integrity | Report only; documents issues, does not fix them |
| `polish` | Refine | `[target]` | Final pass: drift, states, alignment, micro-detail; refinement, never hidden redesign | Edits; reads and closes a current critique snapshot |
| `bolder` | Refine | `[target]` | Amplifies safe designs while keeping usability | Edits |
| `quieter` | Refine | `[target]` | Lowers visual intensity while keeping quality | Edits |
| `distill` | Refine | `[target]` | Removes what the surface does not need | Edits |
| `harden` | Refine | `[target]` | Errors, i18n, overflow, real-data edge cases, resilience | Edits |
| `onboard` | Refine | `[target]` | First-run flows, empty states, activation | Edits |
| `animate` | Enhance | `[target]` | Purposeful motion and interaction feedback | Edits |
| `colorize` | Enhance | `[target]` | Strategic color for monochrome interfaces | Edits |
| `typeset` | Enhance | `[target]` | Font choice, hierarchy, sizing, weight, readability | Edits |
| `layout` | Enhance | `[target]` | Spacing, rhythm, composition, hierarchy | Edits |
| `delight` | Enhance | `[target]` | Personality and memorable touches | Edits |
| `overdrive` | Enhance | `[target]` | Technically ambitious effects: shaders, spring physics, scroll-driven reveals | Edits; may add dependencies, so confirm first |
| `clarify` | Fix | `[target]` | UX copy, labels, error messages, instructions | Edits copy; ask before replacing factual claims |
| `adapt` | Fix | `[target] [context]` | Screen sizes, devices, touch, print; native variant on iOS/Android | Edits |
| `optimize` | Fix | `[target]` | Loading, rendering, animation, image and bundle performance | Edits; measure before and after |
| `live` | Iterate | none | Pick an element in the running app and cycle HTML+CSS variants via HMR | Needs a local dev server; starts a local helper; accepting writes source. Web only |
| `generate` | Iterate | `[n] [action] [element]` | Live variants of a named element without manual picking | Same as `live`; never runs init/document. Web only |

## Utility verbs

| Verb | What it does | Gate |
|---|---|---|
| `/impeccable pin <command>` / `unpin` | Creates or removes a standalone `/<command>` shortcut | Writes harness command files; confirm |
| `/impeccable hooks <on\|off\|status\|ignore-rule\|ignore-file\|ignore-value\|reset>` | Manages the per-project design hook and detector ignores | `on` installs provider hook manifests; `reset` deletes project config; see [install and safety](install-and-safety.md) |
| `/impeccable doctor` | Reports and repairs schema drift in PRODUCT.md, DESIGN.md, sidecar, config, surface briefs and hook | Repairs only on request; never as a side effect of a design task |

The upstream `doctor` verb is different from this operator's offline
`scripts/doctor.py`: the upstream verb runs the engine against project artifacts; the local
script inspects files and never runs anything.

## Platform limits

`live`, `generate` and the detector read web markup only. On `ios`, `android` or `adaptive`
projects, use the native variants (`audit.native`, `adapt.native`), skip the detector and say
so. A clean detector run on native source is not evidence of anything.

## Common chains

- New project: `init` → `shape` → build → `critique` → `polish`.
- Existing surface with no context: `document` (or `init`) → `critique <surface>` → fix → `polish`.
- After a critique: the top issues name their commands; `polish` closes the snapshot.
- Technical gate before release: `audit` → `harden`/`adapt`/`optimize` per finding → `polish` → `audit` again.
- Detector findings: run [`triage_findings.py`](../scripts/triage_findings.py) and follow its command order.
