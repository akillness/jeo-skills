---
name: "open-ontologies"
description: "Operate fabio-rovai/open-ontologies, the Rust RDF/OWL semantic planning and verification engine: inspect and validate ontologies, plan changes, query/reason, produce certificates, or connect its MCP interface. Use when users name Open Ontologies, `open-ontologies`, `oo-cert`, or ask for change-impact/certified ontology operations. This is an ontology engine and CLI/MCP server, not a visual ontology editor; route visual editing to Protégé or a workbench skill."
allowed-tools: Bash Read Grep Glob
compatibility: "Runtime operations need an Open Ontologies binary. scripts/install.sh builds the pinned revision from source: Rust/Cargo 1.88+ (cargo 1.87 refuses the locked dependency set), a C/C++ compiler and libclang for the Oxigraph RocksDB bindings, git, python3. Lean 4 checker workflows additionally require Lean 4 tooling."
metadata:
  version: "1.2.0"
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
2. To get a working binary, after the user approves the clone, crate/Git-patch download, compile, and the copy into `BIN_DIR`, run `scripts/install.sh` from the skill root. It clones the pinned commit into `SOURCE_DIR` (default `~/.local/share/open-ontologies/src`), runs `preflight.py` on it, builds with `cargo build --locked` (`PROFILE=release` by default; a first release build takes several minutes — about 3–7 minutes observed on Apple Silicon — and roughly 1 GB of target output), copies the binary to `BIN_DIR/open-ontologies` (default `~/.local/bin`), then runs `scripts/smoke.py`. If the active cargo is older than 1.88 it picks the newest installed stable rustup toolchain that qualifies, or set `RUST_TOOLCHAIN`. It refuses to overwrite an existing binary or reset a checkout at another commit without `--force`. It never starts a server or registers an MCP client.
3. Verify any binary you intend to use with `python3 scripts/smoke.py --binary /path/to/open-ontologies [--json]`. It runs one local `batch` process with `--no-connect` against a temporary data directory: loads two triples, confirms a SPARQL query finds no `dependsOn` row, runs `reason --profile rdfs`, and confirms exactly one inferred row appears. Exit `0` is runtime proof for the CLI batch/RDFS surface of that binary on that host only; it proves nothing about MCP transports, certificates, other profiles, or the user's data. Exit `1` is a failed check, `2` means the binary could not be run.
4. Identify the intended backend and exact ontology inputs. Inspect current source files and scope before planning; do not write/apply a plan without explicit authorization for that data and destination.
5. Use the installed binary's own `--help` for exact subcommands and flags (there is no `--version`; the first `--help` line identifies the tool). `batch -` accepts a JSON array of `{"command","args"}` objects on stdin; `query` takes one SPARQL string as a single argument. The pinned README demonstrates `printf 'load base.ttl\\nplan proposed.ttl\\n' | open-ontologies batch -`; treat it as an example, not a command to run without input review.
6. Keep evidence classes separate: engine result, supplied-rule result, prover opinion, and independently checked certificate are not interchangeable. Report unknown, incomplete, unsupported constructs, and budget exhaustion as such, never as a negative answer or complete proof.
7. Before MCP setup or any runtime command on user data, obtain approval for the exact install/build/download, client registration, listener bind/auth, remote data access, provider call, graph/database mutation, or public deployment. Inspect transport and client scope first; stdio package metadata and source `serve-http` are different exposure modes.
8. Preserve each helper's scope: `preflight.py` uses only Python stdlib and selected-file hashing and never executes upstream code or touches the network; `smoke.py` executes the binary but writes only inside a temporary directory; `install.sh` is the only script with network and filesystem side effects.

## Examples

- “Compare these two RDF files and show semantic consequences before I apply anything.”
- “Check whether this entailment has a certificate and distinguish undecided from false.”
- “Configure the Open Ontologies MCP server for my editor.”
- “Install Open Ontologies from the pinned source and prove the binary actually works before I point it at my ontology.”

## Best practices

- Use `oo-cert` only on the assertion/derivation artifacts it is intended to check, and preserve its exit status and verdict text.
- Planning or a successful validation does not mutate production data; applying, importing, or writing artifacts is a separate approval boundary.
- Read [`references/upstream.md`](references/upstream.md) and verify the matching pinned source before choosing exact flags. The offline helper checks selected file hashes only, not Git HEAD or runtime readiness; `smoke.py` is the runtime check, scoped to CLI batch/RDFS.
- Prefer `--no-connect` and an explicit throw-away `--data-dir` for exploratory CLI runs so nothing reaches a daemon or the default `~/.open-ontologies` store.

## Completion

- Report the mode used (`offline-selected-files`, CLI, stdio MCP, or HTTP MCP), exact source evidence consumed, approval boundary crossed, and observed result. After `install.sh`, report the toolchain it selected, the installed path, and the `smoke.py` verdict.
- Claim runtime readiness only after a separately approved run of the installed binary/client (`smoke.py` exit `0` is that evidence for the CLI batch surface); never promote a selected-file hash match, tool presence, build success, or source inspection into runtime proof.

## References

- [`references/upstream.md`](references/upstream.md) - setup, verified build/toolchain facts, command families, scope limits, license, safety.
- [`scripts/install.sh`](scripts/install.sh) - approved clone + `cargo build --locked` + copy to `BIN_DIR` + smoke test; the only helper with side effects.
- [`scripts/smoke.py`](scripts/smoke.py) - runtime check of one binary (load, query, RDFS reason, query) in a temporary data directory.
- [`references/source.json`](references/source.json) - selected pinned file SHA256s; not a whole-revision attestation.
- [`evals/evals.json`](evals/evals.json) - authored routing and boundary scenarios, not executed model-quality tests.
