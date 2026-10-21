---
name: "orionbelt-ontology-builder"
description: "Operate ralforion/orionbelt-ontology-builder, a Python/Streamlit browser workbench for OWL ontologies and SKOS vocabularies: inspect local launch modes, explain editing/import/reasoning/validation workflows, or troubleshoot the app. Use when users name OrionBelt or ask for its browser or desktop ontology workbench. It is an application/workbench, not a general ontology reasoning framework; route general RDF graph pipelines to Semantica or Open Ontologies."
allowed-tools: Bash Read Grep Glob
compatibility: "Requires Python 3.12+ for current source and a compatible Streamlit environment; desktop mode has additional OS-specific dependencies."
metadata:
  version: "1.0.0"
  source: "https://github.com/ralforion/orionbelt-ontology-builder"
  upstream_commit: "af59e2bb564e881739d57a05fc29190d46d921bb"
---

# OrionBelt Ontology Builder

## Instructions

1. Classify the task as browser workbench, desktop launcher, or read-only project inspection. Check the source pin and Python requirement before recommending a runtime.
2. For the documented isolated tool route, `uv tool install orionbelt-ontology-builder` installs and `orionbelt-ontology-builder` launches the app. This is an example only; do not install or start anything without explicit approval.
3. Treat imports, edits, bulk operations, deletes, and exports as changes to user data. Preview diffs, identify the target ontology, and obtain authorization before applying or writing. Use undo/checkpoints as recovery aids, not as a substitute for approval.
4. Report modeling boundaries: the editor surfaces OWL classes/properties and SKOS; the README says pure RDFS vocabularies are not surfaced in those panels. Do not imply it is Protégé or a general database/graph platform.

## Examples

- “Help me launch OrionBelt locally and import an OWL file without changing it yet.”
- “Review an import conflict report and explain merge versus replace.”
- “Can OrionBelt edit a pure RDFS vocabulary?”

## Best practices

- Prefer review panels and change reports before import; avoid “fix everything” assumptions when ontology semantics require author judgment.
- Separate a local CLI launch from the hosted Streamlit app. Local launch enables disk-backed autosave/linked-file persistence in the pinned CLI; inspect destination and backup implications first.
- Read [`references/upstream.md`](references/upstream.md) for exact documented commands, licensing constraints, and failure boundaries.

## References

- [`references/upstream.md`](references/upstream.md) - setup, runtime modes, capability limits, license and approval gates.
- [`references/source.json`](references/source.json) - selected pinned file SHA256s; not a whole-revision attestation.
- [`evals/evals.json`](evals/evals.json) - authored routing and boundary scenarios, not executed model-quality tests.
