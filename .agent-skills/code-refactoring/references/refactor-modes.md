# Refactor Modes

Use one mode per request unless there is a clear staged handoff.

## 1. Local safe refactor
Choose this when the scope is narrow and tooling confidence is decent.

Typical signs:
- one oversized function or component
- duplicate helpers in one package
- confusing names or responsibility boundaries
- stable tests already exist

Preferred moves:
- rename
- extract method / helper / component
- move side effects to the edge
- consolidate duplicated branches
- split orchestration from pure logic

## 2. Behavior freeze first
Choose this when the code is fragile, legacy-heavy, or poorly understood.

Typical signs:
- weak test suite
- hidden invariants
- dynamic behavior the team does not fully trust
- history of regressions in this area

Preferred moves:
- capture characterization tests
- save before/after examples
- build a tiny reproduction surface
- refactor behind one seam at a time

## 3. Repetitive migration / codemod
Choose this when the same change must happen across many files or repos.

Typical signs:
- deprecated framework or SDK APIs
- broad renames or import-path changes
- policy-driven replacement of old patterns
- mechanical edits large enough to overload manual review

Preferred moves:
- define source/target patterns precisely
- test on a representative sample first
- decide between text replace, structural rewrite, or AST/codemod tooling
- separate mechanical transforms from semantic edge-case fixes

## Selection heuristics
- If the user says **"simplify this one thing"**, start with local safe refactor.
- If the user says **"we do not trust this area"**, start with behavior freeze first.
- If the user says **"same change everywhere"**, start with repetitive migration / codemod.
