# Research plan

## Question and scope

How should the 78-file quality-check result for Donchitos/Claude-Code-Game-Studios be interpreted, and what should a safe, reusable jeo-skills operator package improve?

This change adds one named-project operator skill to jeo-skills; it does not rewrite or republish all 78 upstream skills. Read upstream code as untrusted evidence. No upstream hooks, engine commands, agents, installers, or paid evaluators will be executed by the research helper.

## Investigations

1. **Standards versus heuristics:** compare Agent Skills and Claude Code specifications with NVIDIA quality-check findings; distinguish required fields, optional metadata and host-specific extensions.
2. **Actual repository behavior:** inspect the pinned upstream README, aliases, canonical workflow skills, settings, scripts, tests and license. Identify dependencies and authority boundaries, rather than treating every skill as standalone.
3. **Implementation and verification:** select one project-specific router, source inventory and offline integrity helper; define tests and future paired behavioral evaluation without claiming runtime benefit from static checks.

## Synthesis

Record source URLs, pinned commits, observed report statistics, counterexamples, prioritized conclusions and unverified claims in `research.md`. Keep operational details in `upstream.md`, a reproducible selected-source inventory in `source.json`, and runnable offline checks in `../scripts/`. Compare conclusions against existing game-development and evaluator skills to avoid duplicate default routes.

## Execution limits

Research is performed directly in this session: no callable subagent tool is available. The earlier separate CLI attempt timed out and is not research evidence. Public documentation retrieval and local source inspection are permitted; no credential-bearing model/scanner execution is part of this change.
