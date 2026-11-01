# Separate performance ratchet

Baseline: the qualified-exclusion candidate after correctness ratchet, whose fixed safety evaluator is 5/5 and independent duplicate-target holdout passes.

Primary mutable artifact: isolated `scripts/link_targets.py`. Hypothesis: computing normalized candidate multiplicity once per line removes repeated per-candidate scans while preserving all results.

Frozen metric: paired, interleaved warm-run wall-clock medians (Python 3.11), five repetitions per version, using the same temporary 2,000-link line, plus paired full-catalog scans. All output rows must match. No claim beyond these local synthetic workloads.

Promotion: correctness evaluator, duplicate holdout, existing regressions and strict catalog all pass; synthetic median improves by at least 20%; full-catalog median does not regress by more than 20%. Ties, mismatches and slower variants are reverted. Budget: one performance candidate, no network, no paid operations.
