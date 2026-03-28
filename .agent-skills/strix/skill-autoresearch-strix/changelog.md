## Experiment 0 - baseline

Score: 5/6
Change: Initial draft only.
Reasoning: Establish the starting point before any prompt mutation.
Result: Covered install, scan modes, and target types, but CI outcome handling was not explicit enough.
Remaining failures: Exit-code behavior needed to be stated directly, not implied.

## Experiment 1 - keep

Score: 6/6
Change: Added explicit exit-code guidance, stronger CI defaults, and a dedicated Strix internal-skills distinction.
Reasoning: The main risk was operator confusion around CI outcomes and the overloaded word "skill."
Result: All six binary evals passed.
Remaining failures: None in the current eval suite.
