---
name: fineenvs
description: >
  Operate adithya-s-k/FineEnvs, a source-verified collection of RL environments, datasets,
  OpenEnv/ORS/NeMo Gym/Verifiers/SkyRL/GEM ports, reward evidence, and GRPO training recipes.
  Use when the user names FineEnvs, asks to run or inspect one of its environment projects, wants
  its deterministic graders or evaluation evidence, or wants to author a new environment from a
  description with the bundled framework skills. Route generic model fine-tuning, RL algorithm,
  or serving work to the appropriate generic skill instead.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Python repository using uv. Most examples require Python 3.11+; NeMo Gym requires Python 3.12+.
  HF Jobs, HF Hub, E2B, Daytona, OpenAI/HF inference, paid Spaces, CUDA GPUs, and model/data
  downloads are optional external services and must be explicitly approved before use.
license: Apache-2.0
metadata:
  version: "1.0"
  source: https://github.com/adithya-s-k/FineEnvs
  upstream_commit: 5e0b46e96bfd20105976e50a06a3b79c9c62f076
---

# FineEnvs operator

FineEnvs is an Apache-2.0 Python repository audited against upstream commit
`5e0b46e96bfd20105976e50a06a3b79c9c62f076` (2026-10-12). Treat the pinned checkout and its
project-local READMEs/configs as the source of truth. The repository contains runnable examples,
not a guarantee that every historical training result can be reproduced: several recipes resolve
moving upstream `main` dependencies, require paid services, or document known service/runtime gaps.

## When to use this skill

- Inspect, pin, set up, smoke-test, or troubleshoot a FineEnvs checkout.
- Run a no-backend Wordle rollout, an E2B-backed Jupyter/Desktop rollout, or an OpenEnv/ORS/NeMo Gym service.
- Work with the LaTeX OCR, Watercolour, GeoGuesser, SmolDataEnvs, multi-harness RL, or PortSimEnv projects.
- Read reward/assessment evidence before proposing training or comparing checkpoints.
- Use the bundled `rl-env-from-description` and four framework-specific skills to author a new env.

Use the manifest-verified `soup` skill for model fine-tuning design unrelated to this checkout; use FineEnvs' bundled framework generator skills for standalone OpenEnv, ORS, Verifiers, or NeMo Gym work; use provider documentation or a separately installed provider skill for unrelated Hub or Jobs operations. External provider CLIs and services are not included in this skill.

## Instructions

1. **Pin and inspect before execution.** For a reproducible checkout, clone the repository and
   `git checkout 5e0b46e96bfd20105976e50a06a3b79c9c62f076`. Read the relevant project README and
   `pyproject.toml`, `README.md`, `REPRODUCE.md`, `VALIDATION.md`, or `eval/README.md` before
   choosing a command. Read `references/upstream.md` for the audited matrix and source links.
2. **Classify the operation.** Separate (a) read-only inventory, dry-run, local fixture smoke, and
   local CPU rollout from (b) service startup, external data/model downloads, credentials, HF Hub
   writes, paid inference, E2B/Daytona sandboxes, GPU Jobs, or deployed Spaces. Ask for explicit
   approval before category (b), and state the exact provider, model, hardware, data volume, and
   expected spend. Never print or commit secret values.
3. **Choose the smallest verified path.** Wordle is the cheapest end-to-end example. From its
   framework directory, `uv sync && uv run python rollout.py` uses the project-root `.env`; do not
   create per-folder secrets. Jupyter/Desktop require `E2B_API_KEY` for local/in-process use.
   `HF_TOKEN` drives HF inference/Jobs and `OPENAI_API_KEY` is only for OpenAI-native models.
4. **Preserve framework contracts.** OpenEnv is HTTP+MCP and discovers tools through
   `MCPToolClient.list_tools()`; ORS is HTTP REST+SSE and uses
   `EnvironmentsAPI(base_url=..., api_key="")` with per-tool `ToolOutput.reward`; NeMo Gym is
   HTTP with cookie sessions (`requests.Session`) and post-episode `/verify`; Verifiers, SkyRL Gym,
   and GEM are in-process. Do not replace discovery with guessed endpoints or silently treat a
   deployed-only NeMo Gym Space as locally runnable.
5. **Collect reward evidence, not just a score.** For SmolDataEnvs report grader mode, split,
   coverage, ungraded failures, and tool/token metrics with pass@1. For PortSimEnv report feasible,
   optimal, ended-without-submit, and reward distribution. For aesthetic or visual rewards report
   scorer availability and reward breakdown. A two-step smoke proves execution/checkpoint reload,
   not learning or quality improvement.
6. **Training is opt-in and bounded.** Prefer fixture/dry-run/evaluation first, then a small smoke
   with explicit output and budget. HF Jobs commands can create GPU, bucket, model, dashboard, and
   sandbox spend; pass secrets only through the provider's secret mechanism. Stop and report the
   exact blocker when prerequisites (GPU, Ray, E2B, Daytona, scorer Space, imagery, or inference
   quota) are absent; do not silently downgrade provider or hardware.
7. **Keep provenance with results.** Record the pinned FineEnvs commit, project path, resolved
   dependency commits/versions, model/checkpoint id, task split/identities, command, environment
   endpoint, hardware, reward/scorer settings, coverage, and output directory. Preserve Apache-2.0
   notices; PortSim data/viewer assets have additional CC BY-SA 4.0 and ODbL attribution requirements.
8. **For new environments**, interview for goal/action/state/reward/backend/termination/path, keep
   one framework-independent domain module, then invoke the bundled `rl-env-from-description` or a
   framework-specific generator. Finish with framework-specific import/server/tool-discovery/rollout
   checks; do not start training as part of authoring.

## Examples

```bash
# Lowest-cost local smoke (no external backend)
cd 00-environments-101/envs/wordle/verifiers
uv sync && uv run python rollout.py

# LaTeX OCR: offline fixture tests and package entrypoint
uv run --project 01-latex-ocr/envs/latex_ocr --extra dev pytest 01-latex-ocr/envs/latex_ocr/tests -q
uv run --project 01-latex-ocr/envs/latex_ocr latex-ocr-smoke

# SmolDataEnvs: all rollout/reward paths use a Hugging Face Sandbox and external data/grader access
cd 04-smoldataenvs
# Requires explicit HF Sandbox approval, HF auth/token and quota, dependency/download approval, and output-path approval.
uv run scripts/rollout.py
uv run scripts/train_grpo.py --dry-run
uv run scripts/eval_pass1.py --dry-run
# `--dry-run` is not local: eval also downloads the dataset/grader and writes eval_results.json.

# Multi-harness: bounded local smoke only after setup approval
cd 05-multi-harness-rl
python jobs/smoke.py --mode multi_harness --output runs/harbor-smoke
```

## Best practices

- Read project-local instructions at the pinned revision; never assume the root quickstart covers
  every subproject.
- Keep local services on localhost and use the documented endpoint variables (`OPENENV_URL`,
  `ORS_URL`, `NEMO_GYM_URL`, or project-specific equivalents); do not probe production Spaces.
- Treat historical tables as evidence with their stated caveats, not as a current benchmark claim.
- For an existing checkpoint, compare the same fixed split and report coverage alongside pass@1.
- Do not use this skill to authorize cloud spend, data licensing, or credentials; those remain human
  decisions.

## References

- [Audited source matrix and command contracts](references/upstream.md)
- [Pinned FineEnvs source](https://github.com/adithya-s-k/FineEnvs/tree/5e0b46e96bfd20105976e50a06a3b79c9c62f076)
- [Pinned root README](https://github.com/adithya-s-k/FineEnvs/blob/5e0b46e96bfd20105976e50a06a3b79c9c62f076/README.md)
- [Apache-2.0 license evidence](https://github.com/adithya-s-k/FineEnvs/blob/5e0b46e96bfd20105976e50a06a3b79c9c62f076/LICENSE)
