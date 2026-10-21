---
name: harness2
description: >
  Operate google-research/harness2 (Harness²), the Apache-2.0 framework for recursive agent
  harnessing: refine the prompts, guardrails, memory, tool guidance, subagents, skills, scripts,
  and plugins around a fixed model through contrastive Propose-Probe-Compose steps and a
  per-domain improvement library. Use when a user wants to run the credential-free local demo,
  preflight or set up the LAB, JobBench, or WorkBuddy benchmarks, budget and launch a parallel
  or sequential refinement run with OpenCode or Codex executors, judge and report results, start
  the Codex bridge, or apply the method by hand to design or refine their own agent harness or
  agent team. Owns the retired `harness` name. Route reusable SKILL.md ratcheting to
  `skill-autoresearch`, multi-agent coordination evals to `multi-agent-eval-harness`, production
  tracing to `agent-observability`, and runtime team execution to `paperclip`, `ruflo`, or
  `zeroshot`.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Python 3.12-3.13 and uv. The local demo needs no credentials. Benchmarks are documented for
  Linux and need Node.js 20+, npm, Vertex AI Application Default Credentials, and per-benchmark
  tools (LAB: pandoc and pdftoppm; WorkBuddy: Docker and curl).
license: Apache-2.0
metadata:
  version: "1.0.0"
  source: https://github.com/google-research/harness2
  upstream_commit: 1cfe254e8d25b15f37048c3730134686abe60335
---

# Harness² operator

## When to use this skill

Use it when the job is improving the *harness* around a fixed model — not its weights — and the
evidence must come from executions: run the upstream pipeline, budget it, judge it, or apply its
Propose–Probe–Compose method to a project's own agent instructions, skills, subagents, or hooks.
Designing an agent team belongs here as method mode: a team is the subagents component plus the
routing text that triggers it, and each role must win a probe.

Route out: reusable `SKILL.md` ratcheting → `skill-autoresearch`; coordination-failure evals for
an existing multi-agent system → `multi-agent-eval-harness`; production traces →
`agent-observability`; running a team on a runtime → `paperclip`, `ruflo`, or `zeroshot`.

## Instructions

1. **Run the offline gate first.** From the repository root:
   `python3 .agent-skills/harness2/scripts/preflight.py --json`; from an installed skill root:
   `python3 "$SKILLS_ROOT/harness2/scripts/preflight.py" --json`. Use `--bench method` for
   manual method mode (host facts only; no tool is required), or `--bench lab|jb|wb` with
   `--substrate oc|cx`; add `--repo PATH --expect-commit 1cfe254e8d25b15f37048c3730134686abe60335`
   for a supplied checkout. It never runs harness2, setup, a model, Docker, or the network, and
   it reports `.env` presence without reading it.
2. **Pick one mode** and load [references/upstream.md](references/upstream.md) for its commands:
   `demo` (credential-free proof of the workflow), `benchmark` (setup → check → run → judge →
   report), `bridge` (Codex executor via Vertex), or `method` (manual application — load
   [references/method-mode.md](references/method-mode.md)).
3. **Demo only when the mode needs upstream code.** For `demo` or before a first `benchmark`
   engagement, get approval for the install (a git clone, `uv venv --python 3.12 .venv` — which may
   download CPython — and `uv pip install -e '.[render]'` from PyPI), then run
   `harness2-demo --output runs/demo --k 2`; it makes no model calls and writes only `--output`.
   `method` mode and fit checks need no checkout, install, or demo.
4. **Gate every benchmark side effect.** Get explicit approval before `harness2-setup` (pinned
   clones, npm/Bun, `uv sync`, dataset and Docker image downloads), before any refinement or judge
   run (paid Vertex calls; about `4k` executor rollouts and `3k` improver sessions per task), and
   before `harness2-bridge` (starts a server; `--host 0.0.0.0` binds all interfaces). Preview with
   `harness2-setup <bench> --dry-run` and `harness2 ... --dry-run`; cap scope with
   `--only-domains` and `--max-tasks` (per domain, not global). Read WorkBuddy's territorial
   license before downloading it.
5. **Isolate the executor.** Codex runs with its sandbox disabled and executors have open network
   access; public rubrics have been fetched by a rollout. Before a scored run, block
   `huggingface.co`, `hf.co`, `*.hf.co`, `github.com`, and `raw.githubusercontent.com` at the
   network layer and report that restriction.
6. **Keep run identity fixed.** Judge and report with the same `--bench`, `--subset`,
   `--substrate`, `--k`, `--mode`, and `--seed` as the run; use a new `HARNESS2_RUNS_DIR` when
   models or task selection change. Write `.env` from the documented keys yourself — the pinned
   commit does not track the `.env.example` its docs mention — and never echo credential values.
7. **Report evidence, not paper numbers.** Return exact commands, pin, mode, `k`, task cap,
   executor/improver/judge IDs, network restriction, exit status (`0` ok, `2` some tasks failed,
   `1` config/dead domain/zero tasks), and the adopted-harness paths. `harness2-check` passing
   does not prove model access; a failed judge is unscored, never zero.

## Examples

```sh
python3 .agent-skills/harness2/scripts/preflight.py --json            # offline gate
harness2-demo --output runs/demo --k 2              # after install approval; no credentials or models
python3 .agent-skills/harness2/scripts/preflight.py --bench lab --json
harness2-setup lab --dry-run                                          # preview only
# after approval of setup, cost, and executor network restriction:
harness2 --bench lab --k 1 --mode parallel --only-domains antitrust-competition --max-tasks 1
harness2-judge --bench lab --k 1 --mode parallel
harness2-report --bench lab --k 1 --mode parallel
```

## Best practices

- Before a first benchmark engagement, prefer the approved local demo; it exercises the real
  recursion and library code without model cost. Method mode never requires it.
- Spend budget on one domain and one task before widening; compare parallel and sequential only
  with task selection, models, judge, and network restriction held fixed.
- Keep always-on text (system prompt, guardrails, memory, tool guidance) inside the substrate cap;
  move detail into skills with explicit trigger lines.
- In method mode, every new subagent, skill, or hook must win an execution probe; record the
  adopted diff and the evidence in a per-domain library entry.

## References

- [Pinned command, configuration, cost, benchmark, and output reference](references/upstream.md)
- [Method mode: manual Propose–Probe–Compose and agent-team design](references/method-mode.md)
- [Upstream README at the pinned commit](https://raw.githubusercontent.com/google-research/harness2/1cfe254e8d25b15f37048c3730134686abe60335/README.md)
- [Paper: arXiv:2610.14224](https://arxiv.org/abs/2610.14224)
- [Apache-2.0 license](https://raw.githubusercontent.com/google-research/harness2/1cfe254e8d25b15f37048c3730134686abe60335/LICENSE)
