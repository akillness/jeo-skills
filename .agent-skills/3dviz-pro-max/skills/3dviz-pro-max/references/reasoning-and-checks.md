# Conditional reasoning and domain checks

Use these records when a modeling decision is uncertain or a meaningful error could survive an attractive render. Read a small relevant subset; they are not a required checklist for every scene.

## Apply a recommendation only in its stated scope

A `reasoning-rule` names `applies_when` conditions and a `constraint_level`:

- **advisory:** a useful design or implementation choice. Adapt, combine or replace it when the user's objective calls for another approach.
- **correctness:** a condition of the specified model or application contract. Check that the model and assumptions actually apply before treating the condition as binding. A fictional depiction or an explicitly different mathematical model may have different constraints.

The record's principles explain the decision, implementation describes a useful response, and observable checks expose a poor choice. These fields are declarative guidance for the agent, not executable policy or an automatic scene rejection system. A style preference should not become a correctness constraint.

Retrieve with `python3 scripts/search.py "your modeling question" --collection knowledge --kind reasoning-rule`. Resolve selected IDs when their complete context and sources are needed. Lexical similarity does not decide whether applicability conditions hold.

## Choose a check that can answer the question

A `domain-validation` record describes a verification procedure and its applicable regime. `check_method` identifies its main observation type:

| Method | What it can establish when actually performed |
| --- | --- |
| `analytic` | Agreement with a stated relation, known solution or error bound in its valid regime |
| `state` | Correct application-owned transitions, identity, constraints or invariants |
| `geometry` | Spatial relationships, topology, dimensions or representation agreement |
| `source` | A bounded claim matches an appropriate source and the represented assumptions |
| `interaction` | A real action changes the intended state and produces the intended response |
| `visual` | The rendered view communicates the intended objects, values or relationships |

These are complementary. Checking a formula does not inspect its rendered arrow direction; a screenshot does not prove a solver or inverse operation. Select the smallest useful combination for the task instead of running every available check.

Every numeric comparison needs a tolerance and a regime, not a request that the reader supply one. Where a record states none, apply `knowledge.validation-default-tolerance-rule`: relative tolerance `1e-6`, absolute position tolerance `1e-9 x scene_scale_m`, angles to `1e-6` rad, integer or discrete state compared exactly, a sampled period to within one sample, and an explicit pixel or percent threshold for a visual comparison.

Combine the two forms as `|computed - expected| <= atol + rtol x |expected|` so a comparison against zero still works, and derive `atol` from the scene scale you declared rather than from a round number.

Those defaults assume double precision and a declared regime: a first-order integrator, a small-angle model or a truncated series should override them in its own record with a bound derived from its step or order, and every reported result names the tolerance actually used.

A stored procedure is not a test result. Record actual inputs, artifact revision, outcome and limitations only after execution. If a needed dataset, domain reference or observation tool is unavailable, preserve that gap rather than inventing evidence or lowering the claim silently.

## Keep creative and factual decisions connected

An expressive scene can use invented proportions, stylized surfaces and deliberate pacing while keeping its intended structure and state coherent. When artistic changes affect a factual reading, distinguish the display transform from the source model and make meaningful exaggeration explicit. Preserve the user's chosen style and stack unless a verified incompatibility requires discussion.

For substantial work, summarize the selected model, applicable rules, original creative choices and planned checks in the [design system](design-synthesis.md). This remains a concise explanation of decisions, not a transcript of private reasoning or another approval gate.
