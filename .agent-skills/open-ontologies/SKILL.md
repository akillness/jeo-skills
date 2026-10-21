---
name: "open-ontologies"
description: "Operate fabio-rovai/open-ontologies, the Rust RDF/OWL semantic planning and verification engine: inspect and validate ontologies, plan changes, query/reason, produce certificates, or connect its MCP interface. Use when users name Open Ontologies, `open-ontologies`, `oo-cert`, or ask for change-impact/certified ontology operations. This is an ontology engine and CLI/MCP server, not a visual ontology editor; route visual editing to Protégé or a workbench skill."
allowed-tools: Bash Read Grep Glob
compatibility: "Requires a compatible built/released Open Ontologies binary for runtime operations; source builds require Rust/Cargo and Lean 4 checker tooling."
metadata:
  version: "1.0.0"
  source: "https://github.com/fabio-rovai/open-ontologies"
  upstream_commit: "dfb09bf815326913d7d7822fa7228f2602fb4976"
---

# Open Ontologies

## Instructions

1. Identify the intended backend and exact ontology inputs. Inspect current source files and scope before planning; do not write/apply a plan without explicit authorization for that data and destination.
2. Use the installed binary's own help for current subcommands. For a batch plan, the pinned README demonstrates `printf 'load base.ttl\\nplan proposed.ttl\\n' | open-ontologies batch -`; treat it as an example, not a command to run without input review.
3. Keep evidence classes separate: engine result, supplied-rule result, prover opinion, and independently checked certificate are not interchangeable. Report unknown, incomplete, unsupported constructs, and budget exhaustion as such, never as a negative answer or complete proof.
4. Before MCP setup, inspect transport and client scope. Do not assume local stdio and network HTTP have the same exposure; verify bind/auth/CORS behavior from current source and ask before changing MCP client configuration or starting a listener.

## Examples

- “Compare these two RDF files and show semantic consequences before I apply anything.”
- “Check whether this entailment has a certificate and distinguish undecided from false.”
- “Configure the Open Ontologies MCP server for my editor.”

## Best practices

- Use `oo-cert` only on the assertion/derivation artifacts it is intended to check, and preserve its exit status and verdict text.
- Planning or a successful validation does not mutate production data; applying, importing, or writing artifacts is a separate approval boundary.
- Read [`references/upstream.md`](references/upstream.md) and verify the matching pinned source before choosing exact flags. The offline helper checks selected file hashes only, not Git HEAD or runtime readiness.

## References

- [`references/upstream.md`](references/upstream.md) - setup, command families, scope limits, license, safety.
- [`references/source.json`](references/source.json) - selected pinned file SHA256s; not a whole-revision attestation.
- [`evals/evals.json`](evals/evals.json) - authored routing and boundary scenarios, not executed model-quality tests.
