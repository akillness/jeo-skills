<!-- JEV-CONTROL-PLANE:START -->
# Jev Control Plane

Always-applied runtime enforcement for the `jeo` agent runtime.

## Skill Routing
Before loading or selecting skills for a task, run:

```sh
node ~/.agents/jev/jev-harness.mjs route-skills "<task>"
```

Inject only the returned Top-K skills into the active context; do not preload the full catalog. Top-K defaults to 3. `--mock` enables deterministic offline keyword routing only. If the result contains `publicRegistryFallback` (no confident local-catalog match), route discovery through the `find-skills` skill: search the public skills.sh registry with `npx skills find "<query>"`, triage install count/source/stars per that skill's rules, and never auto-install without explicit user confirmation.

## Long-Session Context
Before compacting a long session, pass candidate `{ "id": "...", "text": "..." }` blocks as JSON Lines to:

```sh
node ~/.agents/jev/jev-harness.mjs prune-context
```

Only drop blocks Jev marks `drop`; preserve `keep` blocks. Mock mode applies conservative local heuristics and is proposal-biased.

## Memory and Commit Gate
Before writing to `.jeo/memory` or the llm-wiki, or committing agent-authored patches, run the `review` subcommand with the task and proposal. Proceed autonomously only for `permit`. For `proposal_only`, stop and ask the user. For `reject`, do not proceed. For `unavailable`, fail closed: no autonomous action. Preserve the SHA-256 receipt with the decision as the audit binding.

```sh
node ~/.agents/jev/jev-harness.mjs review "<task>" '<proposal-json>'
```

## Transport and Offline Mode
With `JEV_API_KEY` set, the harness posts typed state/questions to `https://api.typesafe.ai/v1/systemone`. Missing credentials, request errors, malformed responses, and timeouts are unavailable and must not permit action. `--mock` works offline using deterministic heuristics/fixtures, is proposal-biased, and must never silently permit autonomous action; review mock outcomes require explicit human confirmation regardless of simulated verdict.
<!-- JEV-CONTROL-PLANE:END -->
