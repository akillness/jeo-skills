# Triage
- Problem: `autoresearch` is a high-utility search-analysis anchor with strong scripts/references but still lacks `evals/evals.json` and likely needs a sharper boundary against the newer repo-local `skill-autoresearch` lane.
- Audience: Maintainers and advanced users who want to run Karpathy-style autonomous ML experiment loops on GPU hardware, plus repo maintainers who need clean trigger boundaries between ML autoresearch and skill-optimization workflows.
- Why now: The `skill-autoresearch` PR was merged this run, which makes the remaining `autoresearch` support gap and boundary overlap more visible. A bounded follow-up can harden the ML-specific lane instead of letting the two skills drift together.
