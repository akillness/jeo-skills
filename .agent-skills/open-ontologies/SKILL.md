---
name: "open-ontologies"
description: "Operate fabio-rovai/open-ontologies, the Rust RDF/OWL semantic planning and verification engine: inspect and validate ontologies, plan changes, query/reason, produce certificates, or connect its MCP interface. Use when users name Open Ontologies, `open-ontologies`, `oo-cert`, or ask for change-impact/certified ontology operations. This is an ontology engine and CLI/MCP server, not a visual ontology editor; route visual editing to Protégé or a workbench skill."
allowed-tools: Bash Read Grep Glob
compatibility: "Requires a compatible built/released Open Ontologies binary for runtime operations; source builds require Rust/Cargo. Lean 4 checker workflows additionally require Lean 4 tooling."
metadata:
  version: "1.1.0"
  source: "https://github.com/fabio-rovai/open-ontologies"
  upstream_commit: "dfb09bf815326913d7d7822fa7228f2602fb4976"
---

# Open Ontologies

## When to use this skill

- Use for Open Ontologies CLI/MCP operation: inspect RDF/OWL inputs, validate syntax or SHACL, plan semantic changes, reason/query, compare/diff, or verify certificates with the project's checker.
- Use when the user names `open-ontologies`, `oo-cert`, an `onto_*` MCP tool, or asks for change-impact, entailment, provenance, or certified ontology results.
- Route visual ontology editing/class-hierarchy authoring to Protégé or `orionbelt-ontology-builder`; route general document-to-graph pipelines, extraction, or vector/backend integration to `semantica`.
- Route generic database administration, hosted-provider setup, or unrelated RDF tooling to the matching platform skill; this package does not replace those operators.

## Instructions

1. Start with the bundled offline source check, before reading or running an upstream binary:
   - From the `jeo-skills` repository root: `python3 .agent-skills/open-ontologies/scripts/preflight.py --repo /absolute/path/to/upstream --json`
   - From an installed `open-ontologies` skill root: `python3 scripts/preflight.py --repo /absolute/path/to/upstream --json`
   Use an authorized absolute source directory with no symlink path components. Exit `0` plus `source_checked: true` means only the manifest-listed public-file hashes matched; `1` means a listed file is missing or mismatched; `2` means invalid, unsafe, or unreadable input. A report is never runtime proof: `runtime_verified` stays `false`.
2. Identify the intended backend and exact ontology inputs. Inspect current source files and scope before planning; do not write/apply a plan without explicit authorization for that data and destination.
3. Use the installed binary's own `--help` for exact subcommands and flags. The pinned README demonstrates `printf 'load base.ttl\\nplan proposed.ttl\\n' | open-ontologies batch -`; treat it as an example, not a command to run without input review.
4. Keep evidence classes separate: engine result, supplied-rule result, prover opinion, and independently checked certificate are not interchangeable. Report unknown, incomplete, unsupported constructs, and budget exhaustion as such, never as a negative answer or complete proof.
5. Before MCP setup or any runtime command, obtain approval for the exact install/build/download, client registration, listener bind/auth, remote data access, provider call, graph/database mutation, or public deployment. Inspect transport and client scope first; stdio package metadata and source `serve-http` are different exposure modes.
6. Preserve the helper's scope: it uses only Python stdlib and selected-file hashing, with PATH discovery for `python3`; it does not execute upstream code, use the network, read secret files, verify Git HEAD, verify dependencies, or establish runtime readiness.

## Examples

- “Compare these two RDF files and show semantic consequences before I apply anything.”
- “Check whether this entailment has a certificate and distinguish undecided from false.”
- “Configure the Open Ontologies MCP server for my editor.”

## Best practices

- Use `oo-cert` only on the assertion/derivation artifacts it is intended to check, and preserve its exit status and verdict text.
- Planning or a successful validation does not mutate production data; applying, importing, or writing artifacts is a separate approval boundary.
- Read [`references/upstream.md`](references/upstream.md) and verify the matching pinned source before choosing exact flags. The offline helper checks selected file hashes only, not Git HEAD or runtime readiness.

## Completion

- Report the mode used (`offline-selected-files`, CLI, stdio MCP, or HTTP MCP), exact source evidence consumed, approval boundary crossed, and observed result.
- Claim runtime readiness only after a separately approved run of the installed binary/client; never promote a selected-file hash match, tool presence, or source inspection into runtime proof.

## References

- [`references/upstream.md`](references/upstream.md) - setup, command families, scope limits, license, safety.
- [`references/source.json`](references/source.json) - selected pinned file SHA256s; not a whole-revision attestation.
- [`evals/evals.json`](evals/evals.json) - authored routing and boundary scenarios, not executed model-quality tests.
