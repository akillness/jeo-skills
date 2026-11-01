# Independent worst-case complexity track

Review found the previous lazy-count candidate remains quadratic when one line contains many distinct qualified exceptions. Its initial performance acceptance is withdrawn for this track.

Baseline: the lazy-count scanner from the preceding performance experiment. Mutable artifact: isolated `scripts/link_targets.py` only. Hypothesis: count normalized (rule, target) pairs once per line rather than once per exception key.

Frozen benchmark: paired/interleaved warm wall time, five repeats, two 2,000-link synthetic lines (no exemptions and 2,000 distinct exact exemptions), and the full real catalog. Require byte-equivalent finding rows on each workload, the 5/5 safety evaluator, duplicate holdout, all regression tests, and scoped strict gate.

Promotion: improve the many-exemption case by at least 20%; neither the zero-exemption case nor catalog may regress by more than 20%; correctness must be unchanged. This is a stress test, not a production latency guarantee. Try one candidate only; revert on failure. No network, credentials, or deferred-scope edits.
