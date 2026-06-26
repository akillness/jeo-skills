---
name: autoresearch
description: ">"
compatibility: ">"
allowed-tools: Bash Read Write Edit Glob Grep WebFetch
metadata:
  tags: autoresearch, ml-experiments, autonomous-research, karpathy, gpu, train, val-bpb, overnight, ratcheting
  version: 1.2.0
  source: "https://github.com/karpathy/autoresearch"
  license: MIT
---












# autoresearch

Autoresearch is a **closed-loop ML experimentation workflow**:
- human writes `program.md`
- agent edits `train.py`
- `prepare.py` stays fixed
- every run gets the same 300-second budget
- lower `val_bpb` wins
- regressions get reverted

This skill should behave like a **routing-first front door**, not a giant tutorial. Pick the user's mode, enforce the immutable-harness rules, then hand them to the smallest useful script or reference.

## When to use this skill

- Set up `karpathy/autoresearch` on a real GPU machine
- Write or refine `program.md` before a session
- Run a bounded overnight `train.py` search loop
- Interpret `results.tsv` after a session
- Adapt the workflow to tighter VRAM constraints without invalidating comparisons
- Explain the ML-specific boundary between `autoresearch` and nearby eval tooling

## Do not use this skill when

- The user wants to optimize a `SKILL.md`, prompt, or repo-local workflow with frozen prompts/evals — use `skill-autoresearch`
- The user wants app-level tracing, dataset-backed LLM evals, feedback review, or observability — use LangSmith, Braintrust, Weave, Promptfoo, or similar tools
- The job does not involve a real training repo, `program.md`, `train.py`, fixed runtime budget, and `val_bpb` keep/revert ratcheting
- The user is really asking for a paper survey, general benchmark scan, or literature review with no intention to run the training loop

## Core boundary

| Concern | `autoresearch` owns | Route elsewhere |
|---------|---------------------|-----------------|
| Mutable target | `train.py` in a real training repo | prompts, app configs, `SKILL.md`, product behavior |
| Fixed evaluator | `prepare.py`, validation shard, `TIME_BUDGET=300`, chosen `MAX_SEQ_LEN` / `EVAL_TOKENS` for the session | prompt/eval datasets, app scorecards, observability dashboards |
| Acceptance rule | keep only lower `val_bpb`; revert ties/regressions | human review queues, app-level release gates |
| Main artifacts | `program.md`, `results.tsv`, kept/discarded commits | prompt suites, traces, feedback datasets |

If that boundary does not fit, do not stretch this skill.

## Required intake packet

Before acting, identify:
1. **Mode** — setup, `program.md`, run loop, results interpretation, or constrained hardware
2. **Repository state** — cloned or not, dependencies installed or not
3. **Hardware state** — GPU / VRAM / CUDA / MLX / Windows path
4. **Session state** — first baseline, active loop, or completed run
5. **Constraint state** — target VRAM ceiling, whether `prepare.py` has already been frozen for this session

## Instructions

### Step 1: Pick exactly one operating mode

Choose the smallest mode that answers the request:

1. **Setup readiness**
   - install `uv`
   - clone repo
   - sync dependencies
   - verify GPU/CUDA/uv with `scripts/check-hardware.sh`
   - run the first baseline experiment

2. **`program.md` authoring**
   - write or refine the human research charter
   - record current baseline `val_bpb`
   - prioritize hypotheses
   - list what has already been tried
   - freeze constraints before the loop starts

3. **Bounded run loop**
   - confirm the evaluator is already fixed
   - use `train.py` as the only mutable search surface
   - run the loop with keep/revert discipline
   - log every experiment to `results.tsv`

4. **Results interpretation**
   - summarize best kept runs
   - identify repeated failures or crash patterns
   - extract what belongs in the next `program.md`
   - distinguish genuine gains from one-off anomalies

5. **Constrained-hardware adaptation**
   - set `MAX_SEQ_LEN` and `EVAL_TOKENS` before the session
   - keep them unchanged once the session starts
   - adjust model/search strategy instead of cheating the evaluator mid-run
   - route to community forks when CUDA assumptions do not hold

Do **not** answer all five modes at once unless the user explicitly asked for a full end-to-end walkthrough.

### Step 2: Re-state the immutable harness

Every mode must preserve these rules:

- `program.md` is human-authored and read-only during a session
- `train.py` is the main mutable search surface
- `prepare.py` is read-only once the session starts
- `TIME_BUDGET=300` stays fixed
- `val_bpb` is the main keep/revert metric
- `results.tsv` is append-only
- dependency set in `pyproject.toml` stays locked

If the user wants to change the evaluator, start a **new comparison track**, not the current session.

### Step 3: Execute the chosen mode

#### Mode A — Setup readiness

Use this path when the repo is not yet runnable.

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
git clone https://github.com/karpathy/autoresearch
cd autoresearch
uv sync
bash scripts/check-hardware.sh
uv run prepare.py
uv run train.py > run.log 2>&1
grep "^val_bpb:\|^peak_vram_mb:" run.log
```

Success condition: one baseline run completes and prints both `val_bpb` and `peak_vram_mb`.

#### Mode B — `program.md` authoring

Use this path when the loop exists but direction is weak.

Minimum sections:
- goal tied to lower `val_bpb`
- current baseline `val_bpb`
- directions to explore in priority order
- what has been tried already
- constraints: `TIME_BUDGET=300`, no `prepare.py` mutation, no new packages, VRAM ceiling, one meaningful change per experiment

For fuller templates and update patterns, use `references/program-md-guide.md`.

#### Mode C — Bounded run loop

Use this path only after setup and `program.md` are ready.

Loop contract:
1. read `program.md` + current `train.py`
2. form one hypothesis
3. edit `train.py`
4. commit
5. run one 300-second experiment
6. extract `val_bpb`
7. keep if improved, otherwise `git reset HEAD~1`
8. append result to `results.tsv`

Typical commands:

```bash
bash scripts/run-experiment.sh
bash scripts/run-loop.sh --max 20 --desc "session-1"
```

Do not encourage multi-change hero rewrites. Clean ablations matter more than flashy edits.

#### Mode D — Results interpretation

Use this path after a completed run or checkpoint.

Helpful commands:

```bash
bash scripts/show-results.sh --top 10
awk -F'\t' '$4=="keep"' results.tsv | sort -t$'\t' -k2 -n
awk -F'\t' '{print $4}' results.tsv | sort | uniq -c
```

Summarize only four things: best gains, repeated failures, what should move into `What Has Been Tried`, and the next narrow experiment family.

#### Mode E — Constrained-hardware adaptation

Use this path when VRAM, platform, or runtime constraints dominate.

Rules:
- choose `MAX_SEQ_LEN` and `EVAL_TOKENS` **before** the session
- never change them mid-session
- lower model/search ambition before mutating the evaluator
- prefer route-outs to community forks for Apple Silicon / non-CUDA paths

For concrete values and troubleshooting, use `references/hardware-config.md`.

### Step 4: Route out aggressively when the request is adjacent

Route out when:
- the user wants to optimize instructions, prompts, or repo-local skills → `skill-autoresearch`
- the user wants app-level traces, feedback review, observability, or online/offline eval dashboards → LangSmith / Braintrust / Weave / Promptfoo
- the user wants general literature synthesis rather than a runnable ML loop → research or survey tooling

### Step 5: Keep the heavy detail in support files

Use support files instead of re-explaining everything inline:
- `references/operating-modes-and-route-outs.md` — fast routing table, minimal response shape, and handoff logic
- `references/architecture.md` — immutability contract, file map, metric rationale
- `references/program-md-guide.md` — templates and update rules
- `references/hardware-config.md` — VRAM tables and platform troubleshooting
- `scripts/*.sh` — runnable setup / loop / reporting helpers

## Available scripts

Run from inside the autoresearch repository directory:

| Script | Purpose | Usage |
|--------|---------|-------|
| `setup.sh` | One-time environment setup | `bash scripts/setup.sh [--seq-len 512]` |
| `run-experiment.sh` | Single 5-minute experiment + metric extraction | `bash scripts/run-experiment.sh` |
| `run-loop.sh` | Autonomous loop: run → keep/revert → repeat | `bash scripts/run-loop.sh [--max 20]` |
| `show-results.sh` | Human-readable `results.tsv` report | `bash scripts/show-results.sh [--top 10]` |
| `check-hardware.sh` | GPU/CUDA/uv readiness check (JSON output) | `bash scripts/check-hardware.sh` |

## References

Detailed documentation in `references/`:

| File | Contents |
|------|----------|
| `references/operating-modes-and-route-outs.md` | Mode picker, adjacency boundaries, and minimal output contract |
| `references/architecture.md` | System design, immutability contract, git ratcheting, metric rationale |
| `references/program-md-guide.md` | How to write and update effective `program.md` directives |
| `references/hardware-config.md` | VRAM settings by GPU, memory optimization, platform troubleshooting |

## Examples

### Example 1: First 40GB GPU session

Request: “Help me run Karpathy autoresearch on a 40GB GPU.”

Expected behavior:
- choose **Setup readiness** first
- verify hardware and dependencies
- run one baseline experiment
- route to `program.md` authoring only after the baseline exists

### Example 2: User wants to optimize a skill instead

Request: “Can autoresearch help me improve this `SKILL.md` with binary evals?”

Expected behavior:
- route out immediately to `skill-autoresearch`
- explain that this skill is for real ML training search on `train.py`

## Best practices

1. **Start with the smallest mode that fits** — setup, authoring, run loop, interpretation, or hardware adaptation
2. **Baseline before bravado** — confirm one successful run before talking about overnight loops
3. **Freeze the evaluator before the session** — `prepare.py`, `TIME_BUDGET`, `MAX_SEQ_LEN`, and `EVAL_TOKENS` must stay comparable
4. **One meaningful experiment at a time** — ablations beat mystery bundles
5. **Keep `results.tsv` append-only** — discarded runs are still evidence
6. **Push deep detail into references/scripts** — the front door should classify and route, not duplicate every table
7. **Route adjacent jobs away early** — prompt/app eval and `SKILL.md` optimization are different lanes

## References

- [GitHub — karpathy/autoresearch](https://github.com/karpathy/autoresearch)
- [Karpathy — A Recipe for Training Neural Networks](https://karpathy.github.io/2019/04/25/recipe/)
- [MLflow Tracking](https://mlflow.org/docs/latest/ml/tracking/)
- [Weights & Biases Tracking](https://docs.wandb.ai/guides/track/)
- [MIT License](https://github.com/karpathy/autoresearch/blob/master/LICENSE)
