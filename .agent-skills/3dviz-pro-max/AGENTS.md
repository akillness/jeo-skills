# Agent working rules

Read `README.md` before planning or implementation. This standalone project uses English public content. Keep internal plans in ignored `plans/`; raw research and temporary artifacts belong in ignored `.local/`. Never commit either location.

When developing or evaluating this repository's skill, use the skills and guidance within this repository rather than external skills. This keeps improvements and evaluation focused on the repository's own capabilities. This development guidance does not restrict end users from combining the published skill with other skills.

## Shared scripts are system contracts

When creating or modifying experiments, inspect the existing shared scripts and package commands first. Reuse their supported entry points and parameters. A worker must not create a local helper script, copy a shared script into an experiment, or bypass shared behavior with an ad hoc replacement.

If an existing command cannot perform a necessary operation, send the main agent a short proposal: the missing capability, existing commands inspected, concrete reuse cases, intended inputs/outputs, affected invariants and proposed validation. Continue independent work while the main agent decides whether to extend a shared script, add a reusable shared command, use an existing direct command, or defer the capability. Approval comes from the main agent; ordinary tooling decisions do not require asking the user again.

Design approved shared scripts around reusable operations and explicit inputs: artifact path, scene/asset selection, backend, output path and scoped check options where relevant. Keep consistent units, transform conventions, state ownership, errors and evidence outputs. Preserve existing callers. Abstract common operations supported by real use cases; avoid speculative frameworks or a branch per experiment.

Experiment-specific scene code, geometry, materials and authored data remain part of the artifact. This rule governs reusable tooling for setup, conversion, building, inspection, validation, capture and packaging. Shared commands do not authorize rendering, headless tests, installation or publication that the user has excluded.

See [shared tooling guidance](docs/shared-tooling.md) for the current command inventory and change process.

### Skill development sessions

These rules govern work on this repository, not the published skill's end users. For experiment tooling, inspect and reuse the project's shared scripts and package commands first. In a team, propose missing reusable capabilities to the coordinating agent before creating local helper scripts or changing shared tooling. A standalone agent owns that decision. Keep scene-specific creative code distinct from shared build, conversion, inspection and validation operations.

Optional external tools follow the same limit. Checking whether Blender CLI is available is a discovery step only: discovery does not authorize installation, rendering or excluded headless work.

## New-domain discoveries during collection

Workers send new-domain or substantially new-topic proposals to the main agent before expanding scope or dispatching another collection worker. Include the gap, overlap with current IDs, likely reusable value, primary sources, existing-family fit and bounded proposed deliverable.

The main agent records an accept, merge, defer or reject decision and its rationale in the active plan's discovery log. Accepted additions receive explicit ownership and scope. A new subject normally fits the existing schema; adding a new dataset family requires a demonstrated structural need and a separate schema/tooling decision.

Factual claims require actual source reads and bounded evidence. Creative proposals need rationale, not invented citations. Keep authored/source-reviewed data distinct from executed experiments.
