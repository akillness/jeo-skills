# Experiment and Figure Coverage

Use this note when the paper needs stronger proof structure rather than prettier prose.

## Experiment coverage checklist
- Main benchmarks: do they test the exact headline problem?
- Baselines: are the strongest realistic comparators included?
- Ablations: does each claimed mechanism have a test?
- Failure analysis: is there at least one place where the method struggles?
- Practicality: if the paper claims efficiency, latency, or lower cost, is that measured?
- Reproducibility: are the implementation details that change outcomes actually written down?

## Figure/table checks
For each important asset, ask:
- what claim does it support?
- can the caption carry the takeaway without rereading the whole section?
- is the manuscript text pointing to the right contrast?
- is a simpler table better than a crowded figure?
- does the asset belong in the abstract / intro narrative or only later?

## Useful packet shapes
- Benchmark summary table
- Ablation table grouped by mechanism
- Error-analysis figure with 2–4 interpretable cases
- Efficiency table with compute / runtime / memory
- Reviewer appendix table showing which concern is addressed where
