# Genkit evals and observability

## Start with a tiny quality loop
Before scaling usage, define:
- 3-10 representative inputs
- what success looks like
- what failure is unacceptable
- whether review is human, automatic, or mixed

## Good Genkit quality signals
- schema-valid structured output
- retrieval actually improves answers
- tool calls happen only when justified
- traces are understandable enough to debug regressions
- deployment logs and runtime metrics match product expectations

## Common failure patterns
- prompt compensates for a bad schema
- retrieval is noisy, so the model looks worse than it is
- tool use is added before one basic flow is stable
- nobody can explain where the output broke in the trace
- "we'll add evals later" becomes permanent

## Practical operator loop
1. Run the flow locally in Developer UI
2. Inspect traces on representative inputs
3. Add or refine a small eval set
4. Fix prompt/schema/tool boundaries
5. Re-run before widening rollout

## Route-outs
If the team mainly needs app-side abuse controls, client integration, or Firebase SDK usage, route back to `firebase-ai-logic`. If the team mainly needs platform logging/ops, pair with `monitoring-observability`.
