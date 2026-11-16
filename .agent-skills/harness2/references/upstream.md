# Harness² pinned operator reference

Audited: [google-research/harness2](https://github.com/google-research/harness2) commit
`1cfe254e8d25b15f37048c3730134686abe60335` (2026-10-13, Apache-2.0, `harness2` 0.1.0,
`requires-python >=3.12,<3.14`). Paper: arXiv:2610.14224. Not an official Google product.
`scripts/preflight.py` is offline-only and never invokes anything below.

## Method

A *harness* is everything around a fixed model. Harness² optimizes it at two levels:

- **Task-level (Propose–Probe–Compose):** `k` base runs first. An editor proposes *invariant* and
  *domain* edits; probes execute the same task; a composer synthesizes behavioral contrasts. No
  ground-truth or rubric feedback reaches the improver; a blind selector picks the final run.
- **Harnessing-level (library):** A reflector stores adopted harnesses and lessons in a per-domain
  library (`INDEX.md` + snapshots). Tasks in a domain run sequentially and read earlier entries;
  each benchmark/executor/mode/budget/seed tuple gets its own library.

| Option | Behavior |
|---|---|
| `--k 1` | One Propose–Probe–Compose step, then reflection |
| `--k K --mode parallel` | Probe `K` general + `K` domain candidates, produce `K` compositions (`agg`) |
| `--k K --mode sequential` | Carry refined harness + evidence through `K` steps (`seq`) |
| `--workers N` | `N` domains concurrently; tasks within a domain stay ordered |
| `--seed N` | Reproducible stream shuffle; does not control model sampling |
| `--substrate cx` | Codex executor instead of default OpenCode (`oc`) |

Cost (`harness2/cli/_common.py`, `run_sweep.py`): ~`R=4k` executor rollouts and `P=3k` improver
sessions per task. Budget from that before any real run.

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

## Commands

| Command | Use | Side-effect boundary |
|---|---|---|
| `uv venv --python 3.12 .venv && uv pip install -e '.[render]'` | install (`render`: openpyxl, python-pptx) | writes `.venv`; uv may download CPython — **approval** |
| `harness2-demo --output runs/demo --k 2 [--mode parallel\|sequential\|both]` | deterministic local recursion + library demo | no credentials/models; writes `--output` only |
| `python -m unittest discover -s tests` | upstream workflow regressions | local only |
| `harness2-setup <lab\|jb\|wb> [--subset S] [--substrate oc\|cx] --dry-run` | print setup plan | read-only `git rev-parse`/`remote get-url`; `cx` needs `HARNESS2_CODEX_BASE_URL` |
| `harness2-setup <bench> ...` | clone pins, patch, `npm install bun@1.3.11`, `bun install`, `uv sync --locked`, data/Docker build | **network + writes under `dependencies/`; approval** |
| `harness2-check --bench <b> [--subset S] [--substrate oc\|cx]` | dependency, credential, config check | runs `gcloud auth application-default print-access-token` (Vertex/Claude/Gemini/wb), `docker info` (`wb`), needs `pandoc`+`pdftoppm` (`lab`); not model access proof |
| `harness2 --bench <b> ... --dry-run` | print task stream, namespaces, domains | no Proposer/model check; needs setup completed |
| `harness2 --bench <b> --k K --mode M [--only-domains D] [--max-tasks N]` | refinement sweep | **paid model calls; open executor network; approval + task cap** |
| `harness2-judge --bench <b> --k K --mode M [--bases]` | judge selected or base runs | **paid judge calls; approval** |
| `harness2-report --bench <b> --k K --mode M` | summarize judged rows | local |
| `harness2-bridge [--host 0.0.0.0] [--port P]` | LiteLLM Responses-API bridge to Vertex for Codex | **starts server**; writes `dependencies/codex/bridge.json` (mode 600); **approval** |
| `python scripts/split_tasks.py --bench b --seed 42 --output splits/b.json` | domain-stratified partition | local; refuses overwrite |
| `python scripts/check_provenance.py` | verify runner/patch hashes vs `dependencies/ASSETS.json` | local |
| `bash scripts/run_{lab,jobbench,workbuddy}.sh ...` | check + refine + judge + report | **paid; approval** |

Judge/report must reuse the run's benchmark, executor, subset, `--k`, `--mode`, and seed. Pass
`--subset office|web|code` on every WorkBuddy command after setup.
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

Auth: `gcloud auth application-default login` (`--no-browser`, `GOOGLE_APPLICATION_CREDENTIALS`,
or impersonation); keep `gcloud` on `PATH`. WorkBuddy requires `google-vertex/gemini...` solver
and bare `gemini...` judge.

Each run stores `config.json`; mismatched resumes error ("different models or tasks") — use a new
`HARNESS2_RUNS_DIR`. Exit codes: `0` ok, `2` partial task failure, `1` config/dead-domain error.

## Benchmarks

| Benchmark | Upstream pin (`dependencies/PINNED.md`) | Needs | Notes |
|---|---|---|---|
| LAB (`lab`) | harveyai/harvey-labs `b58a28ae9fde5ee4b810e53b4fd0a1915325a35d` | `pandoc`, `pdftoppm` | 1,143 tasks; Partial/All-pass; Vertex 429 = quota |
| JobBench (`jb`) | Job-Bench/job-bench-eval `fa03a17f9ff662f136798a274e10011c3aa00fd0` | — | revision recorded in `dataset/main/.harness2-download.json` |
| WorkBuddy (`wb`) | Tencent/workbuddy-bench `b516950be5b56eb3be406c2f76ee1c5111dcb57f` | Docker, curl | territorial Tencent license; verified via `SHA256SUMS` |
| OpenCode / Codex | OpenCode `23fb5e0516c99ac04a1aa46c193efda2e1b9bb24` | Bun 1.3.11 | Codex pinned to `@openai/codex@0.144.6` |

Setup contacts github.com, registry.npmjs.org, huggingface.co, Docker, astral.sh. Codex runs
unsandboxed and rollouts have fetched public rubrics. Before scored runs, block `huggingface.co`,
`hf.co`, `*.hf.co`, `github.com`, and `raw.githubusercontent.com` at the network layer.

## Outputs

Default roots: `runs/lab/`, `runs/jb/`, `runs/wb/<subset>/`. Per task under
`runs/<ns>/<task>/`: `summary.json`, `harnesses/{base,inv*,dom*,agg*|seq*}`, `context/`,
`selection/`, `reflection/*.experience`. Library: `library/<k>/<mode>/<domain>/{INDEX.md,harnesses/}`.
Judged rows: `<runs_root>/<namespace>/judged.json` (or `base_judged.json` with `--bases`). Failed
judges stay unscored, never zero. Repeat the same command to resume.

## Local verification (2026-10-21)

`/tmp` clone at pin, macOS 26 arm64, uv 0.9.10, no credentials: `uv venv --python 3.12` +
`uv pip install -e .` + `harness2-demo --k 2` passed 2/2 (`execution_count` 28, `editor_calls`
32; wrote `inv1/inv2/dom1/dom2/agg1/agg2`, `library/k2/agg/accounting/INDEX.md`); upstream
`unittest` passed 5/5. No benchmark/model/judge/bridge/Docker ran.

## Pinned source citations

See [references/citations.md](citations.md) for the pinned commit file links and Apache-2.0 license.
