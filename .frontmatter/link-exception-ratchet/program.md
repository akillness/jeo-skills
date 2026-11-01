# Link-exception safety ratchet

This is a bounded adaptation of Karpathy's fixed-evaluator, one-change, keep/revert method; it is not the upstream ML training program.

## Goal
Prevent a line-wide link exception from silently hiding an unrelated broken link on the same line, without changing configured R-2 deferrals or losing existing single-link legacy behavior.

## Mutable artifact
Only the isolated copy of `scripts/link_targets.py` is mutable during an experiment. `.frontmatter/link-check-exclusions.txt` and persistent regression tests may be synchronized afterward if the measured candidate wins.

## Frozen evaluation
The independent `evaluate.py` uses the same fixture inputs and five binary checks on every run: real-link detection, legacy and deferred handling, fail-closed ambiguous legacy exclusion, qualified rule-and-target precision, and path/CWD normalization. A qualified exception uses `<logical source>:<line>\t<rule>\t<target>`. Existing full test suite and catalog strict check are separate safety gates.

## Decision and budget
Run baseline first. Try at most 3 single-hypothesis variants; do not change this charter or evaluator. Keep a candidate only if its binary score improves and existing regressions, configured scope and catalog checks stay green. Revert ties and regressions. No network, credential access, paid calls, persistent host settings, or edits to deferred skill content. Log each result in results.tsv.
