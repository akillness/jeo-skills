## Experiment 0 - baseline

Score: 4/6
Change: Initial draft only.
Reasoning: Establish the starting behavior before refining the skill.
Result: High-level CLI coverage existed, but vault targeting and URI safety were too vague.
Remaining failures: Headless separation and callback details were not explicit enough.

## Experiment 1 - keep

Score: 6/6
Change: Added precise enablement steps, vault and file targeting rules, URI callback guidance, Linux registration cautions, and an explicit Headless distinction.
Reasoning: The main failure mode was user confusion between desktop CLI control, URI automation, and separate headless workflows.
Result: All six binary evals passed.
Remaining failures: None in the current eval suite.
