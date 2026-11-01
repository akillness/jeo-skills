# Separate catalog-latency track

Baseline: the safe once-per-line normalized Counter candidate. Objective: avoid allocating a Counter on ordinary lines that have no qualified exception, while retaining at most one Counter per line when needed.

Frozen harness: reuse the unchanged `evaluate-complexity.py` paired five-run benchmark and `evaluate.py` correctness rubric. Mutable artifact: `scripts/link_targets.py` only. No change to test inputs or thresholds during this track.

Keep one candidate only if all finding rows and safety gates remain identical, catalog median improves by at least 5%, and neither synthetic case regresses by more than 20%. Ties or regressions are reverted. Local-only; no network, credentials or changes to R-2.
