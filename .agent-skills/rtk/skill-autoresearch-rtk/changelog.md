## Experiment 0 - baseline

Score: 4/6
Change: Initial operational draft only.
Reasoning: Establish the baseline before tightening install verification and platform-specific guidance.
Result: The draft covered installation and init basics but left the wrong-package repair path and direct-command fallback too implicit.
Remaining failures: Verification-first behavior and the built-in-tool limitation were not explicit enough.

## Experiment 1 - keep

Score: 6/6
Change: Added `rtk gain` verification-first guidance, wrong-package repair, agent-specific init mapping, built-in-tool fallback, and focused wrapper scripts plus references.
Reasoning: The baseline risk was that users would reinstall blindly or assume Codex behaved like Claude hooks.
Result: All six binary evals passed.
Remaining failures: None in the current eval suite.
