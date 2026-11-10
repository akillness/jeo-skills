---
name: revfactory-harness
description: >
  Operate revfactory/harness, the Apache-2.0 Claude Code team-architecture factory:
  audit or install its plugin, design domain-specific agents and skills, select an
  execution mode, migrate v1 artifacts, and evolve an existing generated harness.
  Use when the request names revfactory/harness, Harness v2, harness-marketplace,
  /harness:evolve, or its Korean team-factory workflow. Triggers on: 하네스 구성,
  하네스 회고, revfactory harness, harness factory, harness migration.
  Do not use for google-research/harness2 benchmarks or generic harness optimization
  (`harness2`), standalone skill authoring (`skill-standardization`), or running a
  Ruflo swarm (`ruflo`).
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Python 3.10+ for the offline helper. Upstream execution requires an installed,
  authenticated Claude Code with the selected tools and model aliases actually
  available. Other hosts can inspect this guide but do not gain Claude-native tools.
license: Apache-2.0
metadata:
  version: "1.0.0"
  source: https://github.com/revfactory/harness
  upstream_commit: 92d9f1b29e7af81acebf51a9fcd1832e739a1414
  upstream_version: "2.1.0"
---

# Revfactory Harness operator

## When to use this skill

Use it for the **revfactory/harness** product: install/inspect the plugin, construct or
extend a domain team, audit generated files, migrate v1 artifacts, or reflect feedback
through its evolve skill. Choose one operation before changing a project.

This catalog's `revfactory-harness` is an operator guide, not the upstream `harness`
plugin. The old catalog name `harness` remains retired in favor of `harness2`; do not
restore that directory, overwrite a foreign `harness`, or alias the two projects.
Generic Propose–Probe–Compose work stays with `harness2`.

## Instructions

1. **Run the offline gate.** From this repository root:
   ```bash
   python3 .agent-skills/revfactory-harness/scripts/preflight.py --json
   ```
   From an installed skill, use `python3 "$SKILLS_ROOT/revfactory-harness/scripts/preflight.py" --json`.
   Add `--repo /path/to/harness --expect-commit 92d9f1b29e7af81acebf51a9fcd1832e739a1414`
   to verify the checkout and all pinned public-file hashes. Add `--project /path/to/project`
   to inspect target-path types and direct-copy collisions. The helper never runs Claude,
   plugin installation, upstream scripts, models, or network requests; it never reads credentials.
2. **Separate catalog installation from plugin activation.** Read
   [installation and provenance](references/upstream.md). Installing this guide copies
   documents and helpers only. Preview the router install; obtain approval for a clone,
   marketplace registration, plugin install, or writes to `.claude/` and `CLAUDE.md`.
   Prefer a verified pinned checkout as the local marketplace. Never silently copy over
   `.claude/skills/harness`, `harness-evolve`, or `evolve`, including linked/shared roots.
3. **Audit before generating.** Read [factory and evolution workflow](references/workflow.md).
   Inspect `.claude/agents/`, `.claude/skills/`, `CLAUDE.md`, and existing orchestration.
   Report new-build, extension, maintenance, or v1 migration scope. Reuse existing roles
   and skills instead of creating same-purpose duplicates. Preserve user edits and output language.
4. **Choose a mode from the control flow and actual host capabilities.** Deterministic
   lists/loops use the upstream Workflow mode only if `Workflow` is exposed; repeated
   expert negotiation uses named agents plus messaging/tasks only if those tools are
   present; one-shot independent work uses available subagents. Check the actual tools,
   supported parameters, models, and budget before execution. Upstream documentation is
   not proof that this session supports `Workflow`, `Agent(name:)`, or `fable`. If a
   required capability is absent, report blocked; do not invent APIs or silently fall back.
5. **Generate the smallest approved team.** Choose one of pipeline, fan-out/fan-in,
   expert pool, producer-reviewer, supervisor, or bounded hierarchical delegation.
   Define reusable roles under `.claude/agents/<name>.md`; methods and exactly one
   orchestrator under `.claude/skills/<name>/SKILL.md`. Specify inputs, outputs, schemas,
   ownership, failure/missing-result policy, and measurable completion. Keep `CLAUDE.md`
   to trigger pointers and change history. Read-only reviewers get no Write/Edit tools.
6. **Keep execution and feedback bounded.** Start with a small sample and explicit token,
   iteration, and concurrency limits. Provider calls and generated commands retain host
   approval policies. Treat failed, missing, or `uncertain` outputs as unresolved, not
   passes. Freeze producer artifacts at phase boundaries before consumers use them.
   For feedback on an existing team, use plugin `/harness:evolve` (or direct-copy
   `/harness-evolve`), change one cause at a time, and record before/after evidence.
   Structural redesign returns to the factory; evolve does not silently add/remove roles.
7. **Verify the generated result, not merely file presence.** Check frontmatter,
   cross-references, actual runtime tools, producer/consumer contracts, and trigger cases.
   Remove obsolete v1 constructs only after confirming the target runtime's replacement
   capabilities. Run a scoped task; compare with/without-skill results only with execution
   approval and report real artifacts, errors, timing/tokens when supplied, and unscored
   failures. A passed offline preflight does not prove plugin loading or team quality.

## Examples

### Inspect a pinned checkout and project without execution

```bash
python3 .agent-skills/revfactory-harness/scripts/preflight.py --json \
  --repo /path/to/harness \
  --expect-commit 92d9f1b29e7af81acebf51a9fcd1832e739a1414 \
  --project /path/to/project
```

### Build or evolve after the approved plugin install

In the selected Claude Code session, request `revfactory/harness로 문헌 검토 팀을 구성해줘`.
After a real run, invoke `/harness:evolve` with the failed output and requested correction.
Keep the initial team, observed delta, adopted change, and the new verification result.

## Best practices

- Progressive disclosure: keep this front door small; load only the relevant pinned
  upstream reference linked from the local workflow guide.
- Select available models by task difficulty and cost; never assign every role the
  most expensive tier or assume an upstream alias resolves on another host.
- Do not enable `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` as an automatic migration fix.
- Preserve `_workspace/` evidence and run IDs; do not recreate missing receipts.
- Upstream's v1 self-reported A/B gains are not evidence for this v2 integration.

## References

- [Pinned provenance, installation modes, and host boundaries](references/upstream.md)
- [Factory, migration, quality, and evolution workflow](references/workflow.md)
- [Audited public-file SHA-256 manifest](references/source.json)
- [Behavioral routing and approval cases](evals/evals.json)
