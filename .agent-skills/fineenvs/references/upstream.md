# FineEnvs pinned evidence and setup notes

Audit target: `adithya-s-k/FineEnvs` at commit
[`5e0b46e96bfd20105976e50a06a3b79c9c62f076`](https://github.com/adithya-s-k/FineEnvs/commit/5e0b46e96bfd20105976e50a06a3b79c9c62f076),
checked 2026-10-12. The repository API reports Apache License 2.0 and the pinned
[`LICENSE`](https://github.com/adithya-s-k/FineEnvs/blob/5e0b46e96bfd20105976e50a06a3b79c9c62f076/LICENSE)
contains the full Apache-2.0 text. This file records source evidence; it does not replace project
READMEs at a newer revision.

## Source map

- Root capabilities and quickstart: [README.md](https://github.com/adithya-s-k/FineEnvs/blob/5e0b46e96bfd20105976e50a06a3b79c9c62f076/README.md)
- Six-framework matrix and setup: [00-environments-101/README.md](https://github.com/adithya-s-k/FineEnvs/blob/5e0b46e96bfd20105976e50a06a3b79c9c62f076/00-environments-101/README.md)
- Matrix manifest: [00-environments-101/project.yaml](https://github.com/adithya-s-k/FineEnvs/blob/5e0b46e96bfd20105976e50a06a3b79c9c62f076/00-environments-101/project.yaml)
- Root credentials: [.env.example](https://github.com/adithya-s-k/FineEnvs/blob/5e0b46e96bfd20105976e50a06a3b79c9c62f076/.env.example)
- Authoring orchestrator: [.claude/skills/rl-env-from-description/SKILL.md](https://github.com/adithya-s-k/FineEnvs/blob/5e0b46e96bfd20105976e50a06a3b79c9c62f076/.claude/skills/rl-env-from-description/SKILL.md)
- Framework contracts: [generate-openenv-env](https://github.com/adithya-s-k/FineEnvs/blob/5e0b46e96bfd20105976e50a06a3b79c9c62f076/.claude/skills/generate-openenv-env/SKILL.md), [generate-ors-env](https://github.com/adithya-s-k/FineEnvs/blob/5e0b46e96bfd20105976e50a06a3b79c9c62f076/.claude/skills/generate-ors-env/SKILL.md), [generate-verifiers-env](https://github.com/adithya-s-k/FineEnvs/blob/5e0b46e96bfd20105976e50a06a3b79c9c62f076/.claude/skills/generate-verifiers-env/SKILL.md), [generate-nemo-gym-env](https://github.com/adithya-s-k/FineEnvs/blob/5e0b46e96bfd20105976e50a06a3b79c9c62f076/.claude/skills/generate-nemo-gym-env/SKILL.md)

## Repository-wide contracts

### Environment selection

`00-environments-101` contains **jupyter**, **wordle**, and **desktop**, each implemented in six
framework dialects: OpenEnv (HTTP+MCP), ORS (HTTP REST+SSE), NeMo Gym (HTTP REST/cookie sessions),
Verifiers (in-process), SkyRL Gym (in-process text action), and GEM (in-process Gymnasium-style).
`project.yaml` marks OpenEnv, ORS, Verifiers, SkyRL Gym, and GEM verified for all three; NeMo Gym is
marked `deployed-only`. Jupyter uses `e2b-sandbox` and four tools; Desktop uses `e2b-desktop` and
19 computer-use tools; Wordle is pure Python with one `guess` tool and no external backend.

The root `.env.example` names the only rollout credentials: `HF_TOKEN` for HF Inference Providers,
`OPENAI_API_KEY` for OpenAI-native models, `E2B_API_KEY` for in-process E2B or local HTTP servers,
and optional `WANDB_API_KEY` for training scripts only. Rollouts read this from the repository root
via `python-dotenv`; do not invent per-folder `.env` files.

The root quickstart is:

```bash
git clone https://github.com/adithya-s-k/FineEnvs
cd FineEnvs
cp .env.example .env
cd 00-environments-101/envs/wordle/verifiers
uv sync && uv run python rollout.py
```

### Framework package/API contracts

- **OpenEnv:** `openenv` (the LaTeX package pins `openenv==0.4.2`; the authoring skill targets
  `>=0.4.1`), FastAPI/MCP server, `MCPToolClient`, and `list_tools()` discovery. Local server examples
  use port 8000. For image tools, use `env.step(CallToolAction(...))` to read MCP image content;
  `call_tool()` returns only the structured `data` field.
- **ORS:** official `openreward>=0.1.33` package (not `ors-sdk`), `Environment`/`Server`/`@tool`,
  Pydantic input models, `ToolOutput(blocks=..., reward=..., finished=...)`, and client
  `EnvironmentsAPI(base_url=..., api_key="")`. The client must not be replaced with
  `OpenReward(base_url=...)` when using HF Space URLs because that client rewrites subdomains.
  The documented local server uses port 8080; HF Space Docker uses port 7860.
- **NeMo Gym:** package installed from `git+https://github.com/NVIDIA-NeMo/Gym`; Python 3.12+;
  `SimpleResourcesServer`, one `POST /<tool>` per action, cookie session from `/seed_session`, and
  post-episode `/verify`. Rollouts use `requests.Session`, not an SDK. Ray startup is documented to
  fail on shared HF/SLURM nodes, so a deployed Space may be the only supported verification path.
- **Verifiers:** in-process `vf.ToolEnv` plus `vf.Rubric`, a toolkit class for TRL/manual use and
  standalone plain functions for `ToolEnv`; no HTTP server or Docker. The repo's generated skill
  explicitly requires `initialize()` to be lazy and `cleanup()` in `finally` for sandboxes.
- **SkyRL Gym/GEM:** in-process alternatives for text-action/tag-parsing tasks. SkyRL uses
  `BaseTextEnv` and `step()` output; GEM uses `gem.Env` and the Gymnasium five-tuple.

## Project operations and evidence

### 01 · LaTeX OCR

README: [01-latex-ocr/README.md](https://github.com/adithya-s-k/FineEnvs/blob/5e0b46e96bfd20105976e50a06a3b79c9c62f076/01-latex-ocr/README.md).
The installable package is `openenv-latex_ocr_env`, Python `>=3.11`, with entry points
`latex-ocr-server` and `latex-ocr-smoke`; its `pyproject.toml` pins `openenv==0.4.2` and optional
`dev`/`train` dependencies. Safe local checks use tiny offline fixtures:

```bash
uv run --project 01-latex-ocr/envs/latex_ocr --extra dev pytest 01-latex-ocr/envs/latex_ocr/tests -q
uv run --project 01-latex-ocr/envs/latex_ocr latex-ocr-smoke
uv run --project 01-latex-ocr/envs/latex_ocr latex-ocr-smoke --real-data
```

The optional local training command is `uv run --project 01-latex-ocr/envs/latex_ocr --extra train
python 01-latex-ocr/train/grpo_latex_ocr.py --smoke`; the HF Jobs example uses
`hf auth login` then `hf jobs uv run --flavor a10g-small --timeout 30m --secrets HF_TOKEN
01-latex-ocr/train/hf_job.py --revision "$(git rev-parse HEAD)" --smoke`. The smoke is two optimizer
steps with two generations and an adapter update check; it is explicitly not quality evidence.
The reward is string-based: normalized edit-distance/exact-match blend
`[0.6 * (1 - normalized edit distance) + 0.4 * exact match] * length factor`; it does not render
LaTeX or prove mathematical equivalence.

### 02 · Watercolour

README: [02-watercolour/README.md](https://github.com/adithya-s-k/FineEnvs/blob/5e0b46e96bfd20105976e50a06a3b79c9c62f076/02-watercolour/README.md).
This is an OpenEnv code-painting environment. Rendering needs a paid `cpu-upgrade` Space, HPSv3
needs a paid `a100-large` Space, the pairwise judge consumes HF inference quota, and training uses a
H200. HPS-only avoids judge quota but still needs HPSv3. `tools/deploy.py` publishes the scorer/env;
restart the env after changing reward weights because they are read at import. A single session is
served at a time and abandoned sessions can block capacity until restart. The README states that
`uv` headers do not pin `trl`, `peft`, `transformers`, or `torch`; historical runs are therefore not
bit-for-bit reproducible without preserving their resolved environments. Do not describe its aesthetic
reward as objective correctness.

### 03 · GeoGuesser

README: [03-geoguesser/README.md](https://github.com/adithya-s-k/FineEnvs/blob/5e0b46e96bfd20105976e50a06a3b79c9c62f076/03-geoguesser/README.md).
The environment is OpenEnv with a local imagery cache; the README calls out a 22 GB imagery sync for
self-hosting. Evaluation is `pip install -r eval/requirements.txt` followed by
`python eval/geoeval.py run --env space --provider anthropic --model claude-sonnet-5 --split eval --limit 5`,
then `python eval/geoeval.py report ...`. Report the project's custom training curve, not GeoGuessr's
own curve; its authors document that the curves differ materially. Historical training used 4xA100,
LoRA, 12-turn episodes, and 8 rollouts/group; these are evidence, not an approval to spend.

### 04 · SmolDataEnvs

README: [04-smoldataenvs/README.md](https://github.com/adithya-s-k/FineEnvs/blob/5e0b46e96bfd20105976e50a06a3b79c9c62f076/04-smoldataenvs/README.md).
The dataset has 5,394 verified tasks (5,000 train, 250 test, 144 eval) from 471 Kaggle datasets.
The grader is deterministic (exact, numeric tolerance, list/percent normalization, symbolic
equivalence) and has no LLM in the reward path. However, the source contracts make all three
convenience commands external side effects: [rollout.py](https://github.com/adithya-s-k/FineEnvs/blob/5e0b46e96bfd20105976e50a06a3b79c9c62f076/04-smoldataenvs/scripts/rollout.py)
creates a Hugging Face Sandbox and stages bucket data; [train_grpo.py](https://github.com/adithya-s-k/FineEnvs/blob/5e0b46e96bfd20105976e50a06a3b79c9c62f076/04-smoldataenvs/scripts/train_grpo.py)
`--dry-run` still runs reward completions through that Sandbox; and [eval_pass1.py](https://github.com/adithya-s-k/FineEnvs/blob/5e0b46e96bfd20105976e50a06a3b79c9c62f076/04-smoldataenvs/scripts/eval_pass1.py)
`--dry-run` still loads the dataset, imports/installs its PEP 723 environment, calls the Sandbox,
downloads the grader, and writes `eval_results.json`. Do not call any of these local-safe: require
explicit HF Sandbox approval, HF authentication/token and quota, dependency/download approval, and
an approved output path first. The commands are:

```bash
cd 04-smoldataenvs
uv run scripts/rollout.py
uv run scripts/train_grpo.py --dry-run
uv run scripts/eval_pass1.py --dry-run
```

Real training/eval uses `scripts/run_on_hf_jobs.sh` and requires HF Jobs. Treat crashes as reward 0,
keep difficulty mix and full split size in the report, and distinguish a dry-run from a GPU result.

### 05 · Multi-harness RL

README: [05-multi-harness-rl/README.md](https://github.com/adithya-s-k/FineEnvs/blob/5e0b46e96bfd20105976e50a06a3b79c9c62f076/05-multi-harness-rl/README.md),
setup: [REPRODUCE.md](https://github.com/adithya-s-k/FineEnvs/blob/5e0b46e96bfd20105976e50a06a3b79c9c62f076/05-multi-harness-rl/REPRODUCE.md).
The setup creates a Python 3.12 venv, runs `bash jobs/install.sh` (TRL/OpenEnv/Transformers upstream
`main`), authenticates HF, exports `HF_TOKEN` and `DAYTONA_API_KEY`, and runs `python prepare.py`.
Preparation downloads 1,250 fixed tasks and records checked revisions. A two-step local smoke is
`python jobs/smoke.py --mode multi_harness --output runs/harbor-smoke`; the HF Jobs submitter is
`python jobs/hf_job.py smoke --mode multi_harness --name <name> --bucket <org/bucket> --timeout 1h`
plus `--submit` to launch. Local/Slurm runs need two GPUs and are not free. Modes are `whitebox`,
`opencode`, and `multi_harness`; `opencode` native mode is deprecated in favor of Harbor.

Evaluation uses `python jobs/run.py eval ...` or `python -m eval.evaluate --mode blackbox ...`.
Report `summary.json` coverage with `pass_at_1_observed`, reward, tool calls, and token use;
ungraded failures are excluded from observed pass@1 and partial coverage exits status 2. Rerunning the
same output directory retries only missing/ungraded pairs. The two-step smoke proves execution and
checkpoint reload, not learning.

### 07 · PortSimEnv v1

README: [07-simulation-environments/portsim-v1/README.md](https://github.com/adithya-s-k/FineEnvs/blob/5e0b46e96bfd20105976e50a06a3b79c9c62f076/07-simulation-environments/portsim-v1/README.md).
This OpenEnv task exposes `get_situation`, `check_plan`, and `submit_plan`, with deterministic CP-SAT
reference grading. It ships 1,050 training and 50 eval tasks; an invalid plan scores at most 0.2 and
the optimum is 1.0. The documented local path is `envs/berth_planning/openenv`; install with
`uv venv -p 3.12 && uv pip install -e '.[agents,dev]'`, serve with
`.venv/bin/uvicorn berth_openenv.server:app --port 8011`, and test with
`.venv/bin/python -m pytest tests -q`. The eval command is
`envs/berth_planning/openenv/.venv/bin/python eval/run_eval.py --run my-run --max-tokens 32000
--models anthropic:claude-sonnet-5-5 --split eval --limit 10`. Port data are CC BY-SA 4.0;
OpenStreetMap/terrain assets have ODbL/attribution obligations; code is Apache-2.0.

## Known limitations and stop conditions

- A current `main` may differ from this audit; re-pin and re-read before using newer commands.
- NeMo Gym local startup can be blocked by Ray binding failures; use the deployed path only when
  explicitly approved, and call it deployed-only rather than locally verified.
- Watercolour scorer/env capacity and long render times can silently degrade reward or stall a run;
  inspect reward breakdown and capacity before training.
- Historical results can omit completion/coverage or use unpinned dependencies; never call them a
  controlled benchmark without the project's own caveats.
- HF Jobs, HF Sandboxes, Hub uploads, buckets, E2B, Daytona, paid Spaces, model/inference quota,
  imagery/scorer sync, dependency installs, and deployment are side effects. Inventory and dry-run
  first, but do not call SmolDataEnvs dry-run flags local: they still create Sandboxes/download data
  or graders and may write result files. Obtain explicit approval before use.
