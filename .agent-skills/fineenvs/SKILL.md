---
name: fineenvs
description: >
  Inspect and run the source-verified adithya-s-k/FineEnvs environment and dataset projects,
  including OpenEnv, ORS, NeMo Gym, Verifiers, SkyRL Gym, and GEM dialects. Use when the user
  names FineEnvs, supplies a checkout, asks for a local smoke or reward-evidence readout, or
  wants to author an environment against its bundled contracts. Route generic training, RL
  algorithms, serving, and provider operations to their owning skills.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Python repository using uv. Most projects require Python 3.11+; the optional NeMo Gym path
  requires Python 3.12+. Cloud services, credentials, downloads, sandboxes, and GPUs are opt-in.
license: Apache-2.0
metadata:
  version: "1.1.0"
  source: https://github.com/adithya-s-k/FineEnvs
  upstream_commit: 5e0b46e96bfd20105976e50a06a3b79c9c62f076
---

# FineEnvs operator

FineEnvs is an Apache-2.0 Python repository audited at
`5e0b46e96bfd20105976e50a06a3b79c9c62f076` (2026-10-12). Its project-local READMEs and configs
remain authoritative; historical runs, moving `main` dependencies, paid services, and known
runtime gaps are not reproducibility guarantees.

## When to use this skill

- Inspect or pin a FineEnvs checkout and select one environment/project path.
- Run a no-backend Wordle smoke or another explicitly approved local fixture check.
- Read reward, grader, coverage, data-license, or framework-contract evidence.
- Author a new environment using the bundled domain and framework-generator contracts.

Do not use this skill as a generic training, serving, Ray, sandbox, Hugging Face, provider, or
cloud-operations guide. Use the owning skill for those operations; consult the audited reference
here to identify their prerequisites and side effects.

## Instructions

1. **Preflight offline.** From the repo root run
   `python3 .agent-skills/fineenvs/scripts/preflight.py --json`; from an installed skill root run
   `python3 "$SKILLS_ROOT/fineenvs/scripts/preflight.py" --json`. For a checkout, add
   `--repo PATH --expect-commit 5e0b46e96bfd20105976e50a06a3b79c9c62f076`. Treat
   `runtime_verified:false` as inspection only: this helper does not import frameworks, read
   secrets, query HTTP/GPU state, create sandboxes, or run evaluations. Optional framework
   markers are informational; do not require all dialects at once.
2. **Pin and read.** Verify the supplied checkout commit, then read its project-local README and
   relevant `pyproject.toml`, `REPRODUCE.md`, `VALIDATION.md`, or `eval/README.md`. Read
   [`references/upstream.md`](references/upstream.md) for the audited matrix, source links,
   framework contracts, reward caveats, licensing, branch requirements, and cloud effects.
3. **Classify before acting.** Keep inventory, source inspection, and no-backend local fixtures
   separate from credentials, downloads, service startup, provider inference, E2B/Daytona or HF
   sandboxes, paid Spaces, GPU Jobs, Hub/bucket writes, and deployment. Obtain explicit approval
   for the latter and state provider, model, hardware, data volume, output path, and spend.
4. **Choose the smallest path.** Wordle Verifiers is the low-cost local route:
   `cd 00-environments-101/envs/wordle/verifiers && uv sync && uv run python rollout.py`.
   Keep repository-root `.env` handling as documented; never invent per-project secret files.
5. **Preserve evidence.** Report the pinned commit, project path, resolved versions or commits,
   split, model/checkpoint, command, endpoint, hardware, reward/scorer settings, coverage, and
   output directory. A smoke proves execution/checkpoint reload, not learning or quality.
6. **Author safely.** Keep one framework-independent domain module, gather goal/action/state/
   reward/backend/termination/path requirements, then use the bundled authoring or framework
   generator skill. Finish with the selected framework's import, discovery, and rollout checks;
   do not start training as part of authoring.

## Examples

```bash
# Offline host/check-out inspection; no upstream process is launched.
python3 .agent-skills/fineenvs/scripts/preflight.py --json
python3 .agent-skills/fineenvs/scripts/preflight.py --json \
  --repo /path/to/FineEnvs --expect-commit 5e0b46e96bfd20105976e50a06a3b79c9c62f076

# Lowest-cost local smoke after reading the pinned project instructions.
cd 00-environments-101/envs/wordle/verifiers
uv sync && uv run python rollout.py

# Offline LaTeX OCR fixture path (the --real-data variant is not offline).
uv run --project 01-latex-ocr/envs/latex_ocr --extra dev \
  pytest 01-latex-ocr/envs/latex_ocr/tests -q
uv run --project 01-latex-ocr/envs/latex_ocr latex-ocr-smoke
```

## Best practices

- Read project-local instructions at the pinned revision; the root quickstart is not a universal contract.
- Keep local endpoints on localhost and use documented variables; never probe production Spaces.
- Treat historical tables as qualified evidence, not current benchmark claims; report coverage with pass@1.
- Preserve Apache-2.0 notices and PortSim CC BY-SA 4.0/ODbL attribution obligations.
- Do not authorize cloud spend, data licensing, credentials, or external side effects on a user's behalf.

## References

- [Audited matrix, framework/reward contracts, licensing, and side effects](references/upstream.md)
- [Pinned FineEnvs source](https://github.com/adithya-s-k/FineEnvs/tree/5e0b46e96bfd20105976e50a06a3b79c9c62f076)
- [Pinned root README](https://github.com/adithya-s-k/FineEnvs/blob/5e0b46e96bfd20105976e50a06a3b79c9c62f076/README.md)
- [Apache-2.0 license evidence](https://github.com/adithya-s-k/FineEnvs/blob/5e0b46e96bfd20105976e50a06a3b79c9c62f076/LICENSE)
