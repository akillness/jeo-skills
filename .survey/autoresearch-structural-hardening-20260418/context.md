# Context: autoresearch structural hardening

## Workflow Context
`autoresearch` shows up at the handoff between research intent and a real experiment loop: users need to choose whether they are doing hardware/setup readiness, `program.md` authoring, bounded run execution, results interpretation, or constrained-hardware adaptation. Public ML workflow references and experiment-tracking products reinforce the same pattern: orientation and route selection come first, then tracking and comparison. A routing-first skill matches that reality better than a giant tutorial.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Solo ML engineer | Set up repo, run GPU experiments, keep fair comparisons | Intermediate |
| Applied research lead | Turn hypotheses into bounded ablation loops | Advanced |
| Student / junior researcher | Learn the immutable-harness workflow without wasting GPU time | Beginner–Intermediate |
| OSS maintainer / benchmark chaser | Reproduce and extend the upstream loop on constrained hardware | Intermediate |

## Current Workarounds
1. Read the repo README plus scattered notes, then manually infer which step matters now.
2. Keep ad hoc shell commands, hardware notes, and `program.md` examples in local markdown, docs, or chat logs.
3. Use experiment trackers or dashboards after the fact, even though the actual loop is still controlled by scripts, shell commands, and local decision rules.
4. Confuse `autoresearch` with generic eval/observability tooling, then stretch the wrong tool for the wrong job.

## Adjacent Problems
- Hosted eval/observability products solve tracing and scoring, not the closed-loop ML training search itself.
- Notebook-first exploration and shell-script launchers still dominate practical ML workflows, so users need concrete references/scripts outside the front door.
- Real-world autonomous experimentation remains human-guided; users still need explicit rules about the immutable harness, one-change ablations, and keep/revert discipline.
- Tool fragmentation persists: repo docs, scripts, trackers, spreadsheets, and notes all coexist.

## User Voices
- Andrej Karpathy’s training recipe frames progress as an iterative empirical loop, not a passive explanation flow: https://karpathy.github.io/2019/04/25/recipe/
- Papers with Code exists because practitioners want direct routing from benchmark claims to code, not just prose: https://paperswithcode.com/
- Weights & Biases and MLflow both emphasize logging/comparing runs, which implies the route-selection problem happens upstream: https://docs.wandb.ai/guides/track/ and https://mlflow.org/docs/latest/ml/tracking/
- Google’s “Hidden Technical Debt in Machine Learning Systems” reinforces that wrong early assumptions compound through the workflow: https://research.google/pubs/hidden-technical-debt-in-machine-learning-systems/
