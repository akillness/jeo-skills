# Link-exception ratchet record

This is a bounded application of Karpathy's fixed-evaluator, single-change, keep/revert method to a repository validator. It is not the upstream ML `autoresearch` program. Runs were performed locally on 2026-11-01/02 KST, with Python 3.11 and no provider calls.

## Outcome

- The original worktree baseline scored **3/5** on `evaluate.py`: a line-only exception hid a second broken link, and rule/target-qualified exceptions were unsupported.
- The final scanner scored **5/5** on the unchanged evaluator. `holdout.py` verifies that two distinct fragments of the same target cannot be hidden by one qualified exception.
- The first 5/5 candidate was discarded after that holdout exposed a duplicate-normalization defect. A later lazy per-key candidate was discarded after review identified a quadratic case. Every result, including provisional and reverted variants, is in `results.tsv`.
- Five paired, interleaved runs on a synthetic line with 2,000 distinct qualified exceptions measured medians of **0.375 s → 0.098 s** for the reviewed lazy-per-key baseline versus the final single-per-line Counter. Full-catalog medians were **0.667 s → 0.651 s** in the same comparison. These are local fixture observations, not production guarantees. Raw timings are in `final-paired.json`.
- The final scoped catalog gate passed; the 22 existing R-2-deferred skills remain deferred. Five missing example images in that deferred scope are not claimed fixed. Legacy raw-target exclusions remain globally scoped for compatibility; the checked-in ledger now uses rule-and-target-qualified entries.

## Frozen inputs

- Base commit for reconstructing the pre-experiment worktree: `6deb9d3580e4646ee3ddbb6015ae062711a95abe`.
- Original worktree scanner SHA-256: `58cf003877a25430447614d6de1b35e23413e39f121fd5331d5eb121c9d5ccdf`.
- Final scanner SHA-256: `676d654d9e1c352fec6c23a1213e6ddbfc6a541f727aeee05328a9f73b4543e4`.
- `program.md` SHA-256: `0e31beed887c351d8d9ec49ae8d59558f43990a6e42f6358bb957225fabffb3f`.
- `evaluate.py` SHA-256: `0c21eaef51c305f9846e8852f7b9f6721f357726f5646e371787df9b25ec8fce`.
- `evaluate-complexity.py` SHA-256: `b722ad258f51daa8cbbe1e4b640d9c046539270e3247fdb2ee65700bb2334976`.

## Reproduce the correctness progression

From a checkout containing this record, choose an empty temporary directory. The evaluation intentionally exits 1 for the 3/5 baseline.

```sh
REPO="$PWD"
R="$REPO/.frontmatter/link-exception-ratchet"
T="$(mktemp -d)"
mkdir -p "$T/scripts"
git show 6deb9d3580e4646ee3ddbb6015ae062711a95abe:scripts/link_targets.py > "$T/scripts/link_targets.py"
git show 6deb9d3580e4646ee3ddbb6015ae062711a95abe:scripts/frontmatter_boundary.py > "$T/scripts/frontmatter_boundary.py"
(cd "$T" && git apply --unidiff-zero --check "$R/baseline.patch" && git apply --unidiff-zero "$R/baseline.patch")
python3 -B "$R/evaluate.py" "$T"  # expected: 3/5, exit 1
(cd "$T" && git apply --unidiff-zero --check "$R/performance-baseline.patch" && git apply --unidiff-zero "$R/performance-baseline.patch")
python3 -B "$R/evaluate.py" "$T"  # expected: 5/5
python3 -B "$R/holdout.py" "$T"  # expected: pass
```

To reconstruct the reviewed lazy per-key scanner and rerun the paired comparison against the current scanner:

```sh
(cd "$T" && git apply --unidiff-zero --check "$R/complexity-baseline.patch" && git apply --unidiff-zero "$R/complexity-baseline.patch")
python3 -B "$R/evaluate-complexity.py" "$REPO" "$T/scripts/link_targets.py" "$REPO/scripts/link_targets.py"
```

`latency-baseline.patch` also reconstructs the eager-Counter candidate from the lazy per-key scanner. The committed unit tests in `scripts/test_link_targets.py` exercise the safety invariants independently of this experiment record. Timing ratios vary with machine load.
