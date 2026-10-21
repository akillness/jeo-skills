# Harness² pinned operator reference

Audited surface of [google-research/harness2](https://github.com/google-research/harness2) at
commit `1cfe254e8d25b15f37048c3730134686abe60335` (2026-10-13, Apache-2.0, package `harness2`
0.1.0, `requires-python >=3.12,<3.14`). Paper: arXiv:2610.14224. Not an officially supported
Google product. The local `scripts/preflight.py` is offline-only and never invokes anything below.

## What the method does

A *harness* is everything around a fixed model that lets it act as an agent. Harness² optimizes
that harness, not model weights, with two recursion levels:

- **Task-level recursion — Propose–Probe–Compose.** `k` reference executions of the base harness
  run first. An editor proposes *invariant* (general) and *domain* edits; each candidate harness is
  probed by executing the same task; a composer builds the refined harness from behavioral
  contrasts between executions. No ground-truth or rubric feedback reaches the improver; a blind
  selector picks the final run.
- **Harnessing-level recursion — the improvement library.** After adoption, a reflector stores the
  adopted harness and evidence-supported lessons in a per-domain library (`INDEX.md` plus harness
  snapshots). Tasks inside one domain run in stream order and read only earlier entries; separate
  benchmark/executor/mode/budget/seed combinations get separate libraries.

| Option | Behavior |
|---|---|
| `--k 1` | One Propose–Probe–Compose step, then reflection after adoption |
| `--k K --mode parallel` | Probe `K` general and `K` domain candidates, then produce `K` compositions (on-disk token `agg`) |
| `--k K --mode sequential` | Carry the refined harness and evidence through `K` successive steps (token `seq`) |
| `--workers N` | `N` domains concurrently; tasks within a domain stay ordered |
| `--seed N` | Reproducible stream shuffle; does not control model sampling |
| `--substrate cx` | Codex executor instead of default OpenCode (`oc`) |

Source (`harness2/cli/_common.py`, `run_sweep.py`): each task costs about `R=4k` executor rollouts
and `P=3k` improver sessions. Budget from that before any real run.

## The eight editable components

| # | Component | OpenCode surface (`substrate/opencode.py`) | Codex surface (`substrate/codex.py`) |
|---|---|---|---|
| c1 | System prompt | `systemprompt.md` (always on) | `AGENTS.md` (always on) |
| c2 | Guardrails | `guardrails.md` (always on; skill trigger lines land here) | folded into `AGENTS.md` |
| c3 | Memory | `LongTermMEMORY.md` (always on) | folded into `AGENTS.md` |
| c4 | Tool guidance | `tool_descriptions/tool_guidance.md` (always on) | folded into `AGENTS.md` |
| c5 | Subagents | `sub_agents/<name>/AGENT.md`, frontmatter `mode: subagent` + `description:` | `sub_agents/<name>/AGENT.md`, installed as `[agents.<name>]` roles |
| c6 | Skills | `skills/<name>/SKILL.md`, `name:` must match the directory | `.agents/skills/<name>/SKILL.md`, `description:` required |
| c7 | Scripts | `scripts/*.py` | `scripts/*.py` (skill scripts compiled) |
| c8 | Plugins / hooks | `plugin/<name>.ts` (acts inside the tool loop) | `.codex/hooks.json` |

Always-on budgets: OpenCode 24,000 characters across c1–c4; Codex `AGENTS.md` 8,000 characters
(Codex also silently truncates it at 32,768 bytes and rejects an empty always-on body). A skill
without a trigger line in always-on text is auto-repaired only while the cap allows.

## Command matrix

| Command | Use | Side-effect boundary |
|---|---|---|
| `uv venv --python 3.12 .venv && uv pip install -e '.[render]'` | install package (`render` adds openpyxl, python-pptx) | writes `.venv`; uv may download CPython from astral.sh — **approval** |
| `harness2-demo --output runs/demo --k 2 [--mode parallel\|sequential\|both]` | real recursion + library workflow with deterministic local editors and real Python executions | no credentials, no model calls; writes only `--output` |
| `python -m unittest discover -s tests` | upstream workflow regressions | local only |
| `harness2-setup <lab\|jb\|wb> [--subset S] [--substrate oc\|cx] --dry-run` | print the exact setup plan | prints commands; for an existing `dependencies/<repo>/.git` runs local read-only `git rev-parse`/`remote get-url`; `cx` dry-run still requires `HARNESS2_CODEX_BASE_URL` |
| `harness2-setup <bench> ...` | clone pinned upstreams, apply patches, `npm install bun@1.3.11`, `bun install`, `uv sync --locked`, download data, build WorkBuddy image | **network + large writes under `dependencies/`; approval** |
| `harness2-check --bench <b> [--subset S] [--substrate oc\|cx]` | dependency, credential, and config check | no model call; runs `gcloud auth application-default print-access-token` only for a `google-vertex` executor/improver or a `claude`/`gemini` judge (always for `wb`), `docker info` for `wb`, and requires `pandoc` + `pdftoppm` for LAB; does not prove model availability |
| `harness2 --bench <b> ... --dry-run` | print task stream, namespaces, domains | no Proposer, substrate, or model validation; nothing written; needs the benchmark already set up to list tasks |
| `harness2 --bench <b> --k K --mode M [--only-domains D] [--max-tasks N]` | refinement sweep | **paid model calls; executors have unrestricted network; approval with a task cap** |
| `harness2-judge --bench <b> --k K --mode M [--bases]` | judge the selected run (or base runs) | **paid judge calls; approval** |
| `harness2-report --bench <b> --k K --mode M` | summarize judged rows | local |
| `harness2-bridge [--host 0.0.0.0] [--port P]` | LiteLLM Responses-API bridge to Vertex for Codex | **starts a server**; writes `dependencies/codex/bridge.json` (port + generated key, mode 600); `0.0.0.0` binds all interfaces — **approval** |
| `python scripts/split_tasks.py --bench b --seed 42 --output splits/b.json` | domain-stratified partition | local; refuses to overwrite |
| `python scripts/check_provenance.py` | verify bundled runner/patch hashes vs `dependencies/ASSETS.json` | local |
| `bash scripts/run_{lab,jobbench,workbuddy}.sh ...` | check + refine + judge + report in sequence | **paid; approval** |

Judging and reporting must reuse the refinement run's benchmark, executor, subset, `--k`, `--mode`,
and seed. Pass `--subset office|web|code` on every WorkBuddy command after setup.

## Configuration

Shell variables override `.env`. The pinned commit references `.env.example` in README/SETUP but
does **not** track it; write `.env` from these documented keys (never print their values):

| Key | Meaning |
|---|---|
| `GOOGLE_CLOUD_PROJECT` (alias `HARNESS2_VERTEX_PROJECT`) | Vertex project |
| `GOOGLE_CLOUD_LOCATION` | defaults to `global` |
| `HARNESS2_SOLVER_MODEL` | executor, OpenCode `provider/model` form |
| `HARNESS2_IMPROVER_MODEL` | improver; defaults to the solver |
| `HARNESS2_JUDGE_MODEL` | bare judge ID; adapter adds the Vertex prefix |
| `HARNESS2_RUNS_DIR` | output root, default `runs/` |
| `HARNESS2_JUDGE_BASE_URL`, `HARNESS2_JUDGE_API_KEY` | JobBench judge on another endpoint |
| `HARNESS2_CODEX_BASE_URL`, `HARNESS2_CODEX_API_KEY`, `HARNESS2_CODEX_MODEL`, `HARNESS2_CODEX_CONTAINER_URL` | Codex executor endpoint (printed by the bridge) |

Authenticate with `gcloud auth application-default login` (or `--no-browser`, a service-account key
via `GOOGLE_APPLICATION_CREDENTIALS`, or impersonation); keep `gcloud` on `PATH` for the check.
WorkBuddy setup refuses unless the solver is `google-vertex/gemini...` and the judge a bare
`gemini...` ID.

A run namespace stores `config.json` (method version, executor, improver, judge, project, location,
endpoints, split, task list, cap, domains, seed). A mismatched resume fails with "This run directory
belongs to different models or tasks" — choose a new `HARNESS2_RUNS_DIR`. Exit codes for
`harness2`: 0 all ok, 2 some tasks failed, 1 configuration error, dead domain, or zero tasks.

## Benchmarks

| Benchmark | Upstream pin (`dependencies/PINNED.md`) | Needs | Notes |
|---|---|---|---|
| LAB (`lab`) | harveyai/harvey-labs `b58a28ae9fde5ee4b810e53b4fd0a1915325a35d` | `pandoc`, Poppler `pdftoppm` | 1,143 tasks; Partial and All-pass; Vertex 429 in `judge.log` means quota |
| JobBench (`jb`) | Job-Bench/job-bench-eval `fa03a17f9ff662f136798a274e10011c3aa00fd0` | — | dataset revision resolved at download, recorded in `dataset/main/.harness2-download.json`; report it |
| WorkBuddy (`wb`) | Tencent/workbuddy-bench `b516950be5b56eb3be406c2f76ee1c5111dcb57f` | Docker, curl | custom Tencent license with territorial limitation — read before download; archives verified against `SHA256SUMS` |
| OpenCode executor | `23fb5e0516c99ac04a1aa46c193efda2e1b9bb24` | Bun 1.3.11 | Codex executor pinned to `@openai/codex@0.144.6` |

Setup contacts github.com, registry.npmjs.org, huggingface.co and its CDN, a Docker registry, and
astral.sh. Benchmark rubrics are public; a validation run saw a Codex rollout download its own
JobBench rubric. Codex runs with its sandbox disabled. Before any scored run, block
`huggingface.co`, `hf.co`, `*.hf.co`, `github.com`, and `raw.githubusercontent.com` for the
executor at the network level (egress firewall or DNS), and report the restriction with results.

## Outputs

Default roots: `runs/lab/`, `runs/jb/`, `runs/wb/<subset>/`. Per task under
`runs/<ns>/<task>/`: `summary.json`, `harnesses/{base,inv*,dom*,agg*|seq*}`, `context/`,
`selection/`, `reflection/*.experience`. Library: `library/<k>/<mode>/<domain>/{INDEX.md,harnesses/}`.
Judged rows: `<runs_root>/<namespace>/judged.json` (or `base_judged.json` with `--bases`). Failed
judges stay unscored, never zero. Repeat the same command to resume.

## Local verification evidence (2026-10-21, this catalog)

Isolated `/tmp` clone at the pin, macOS 26 arm64, uv 0.9.10, empty credentials environment:
`uv venv --python 3.12` + `uv pip install -e .` then `harness2-demo --k 2` completed 2/2 tasks,
0 failed (`execution_count` 28, `editor_calls` 32) and wrote `inv1/inv2/dom1/dom2/agg1/agg2`
harnesses, selection, reflection, and `library/k2/agg/accounting/INDEX.md`. Upstream
`python -m unittest discover -s tests` passed 5/5. No benchmark setup, model, judge, bridge, or
Docker step was executed; Linux benchmark behavior is documented upstream, not verified here.

## Pinned source citations

- [README.md](https://raw.githubusercontent.com/google-research/harness2/1cfe254e8d25b15f37048c3730134686abe60335/README.md)
- [docs/SETUP.md](https://raw.githubusercontent.com/google-research/harness2/1cfe254e8d25b15f37048c3730134686abe60335/docs/SETUP.md)
- [docs/EXPERIMENTS.md](https://raw.githubusercontent.com/google-research/harness2/1cfe254e8d25b15f37048c3730134686abe60335/docs/EXPERIMENTS.md)
- [docs/BENCHMARKS.md](https://raw.githubusercontent.com/google-research/harness2/1cfe254e8d25b15f37048c3730134686abe60335/docs/BENCHMARKS.md)
- [harness2/cli/run_sweep.py](https://raw.githubusercontent.com/google-research/harness2/1cfe254e8d25b15f37048c3730134686abe60335/harness2/cli/run_sweep.py)
- [harness2/substrate/opencode.py](https://raw.githubusercontent.com/google-research/harness2/1cfe254e8d25b15f37048c3730134686abe60335/harness2/substrate/opencode.py)
- [harness2/substrate/codex.py](https://raw.githubusercontent.com/google-research/harness2/1cfe254e8d25b15f37048c3730134686abe60335/harness2/substrate/codex.py)
- [dependencies/PINNED.md](https://raw.githubusercontent.com/google-research/harness2/1cfe254e8d25b15f37048c3730134686abe60335/dependencies/PINNED.md)
- [LICENSE (Apache-2.0)](https://raw.githubusercontent.com/google-research/harness2/1cfe254e8d25b15f37048c3730134686abe60335/LICENSE)
