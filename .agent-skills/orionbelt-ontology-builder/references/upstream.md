# OrionBelt pinned source notes

Observed 2026-10-16 (Asia/Seoul). Upstream: [ralforion/orionbelt-ontology-builder](https://github.com/ralforion/orionbelt-ontology-builder), full commit `af59e2bb564e881739d57a05fc29190d46d921bb` (commit time 2026-10-14T07:53:30Z). Selected-file hashes are in [`source.json`](source.json); they do not verify Git HEAD, all files, or runtime.

## Setup and runtime

Pinned `pyproject.toml` declares Python `>=3.12`, Streamlit application dependencies and entrypoints `orionbelt-ontology-builder` and `orionbelt-ontology-builder-desktop`. README's isolated browser-workbench route is:

```sh
uv tool install orionbelt-ontology-builder
orionbelt-ontology-builder
```

The console entrypoint sets a local persistence flag and starts Streamlit with the package's `streamlit_entry.py`; app launch is not read-only because it enables disk-backed autosave/linked-file persistence. The README also documents one-off `uvx` use; consult the pinned README before selecting its exact command. Desktop mode has separate `desktop`/`qt`/`gtk` extras and platform prerequisites; do not recommend it as equivalent to browser mode without checking host support. The hosted demo is a separate service and is not a private local copy.

The tool is a browser/desktop OWL and SKOS workbench using Streamlit, rdflib and OWL-RL. README explicitly says pure RDFS vocabularies are not surfaced in its Classes/Properties panels. It has undo checkpoints, reviewable import diffs, validation, SPARQL console and export; it is not a general graph database or a drop-in Protégé replacement. Review merge/replace/overwrite and deletion consequences before confirming. Avoid implying every reported quality concern has an automatic safe fix.

Pinned `local_store.py` gates local filesystem persistence behind `ORIONBELT_LOCAL_PERSIST`; the local CLI/desktop launchers enable it. It writes recovery state under `~/.orionbelt_ontology_builder/` and supports an optional user-selected linked file. A synced linked folder can copy ontology data off-machine, so confirm the exact path and sync destination. The cloud path is documented to use browser localStorage instead of local disk persistence.

## License and safety

The full pinned `LICENSE` is Business Source License 1.1, not permissive OSI open source: Additional Use Grant permits purposes including production only if OrionBelt is not embedded in a commercial product or provided as a commercial service absent a commercial license. Change Date is 2030-03-30; Change License is Apache 2.0. The BSL text applies to use of the Licensed Work; this operator is original prose and does not copy upstream implementation. Do not vendor or redistribute upstream code. Seek licensor/legal review for commercial product/service use.

Before package installs, desktop dependency downloads, app startup, uploads, provider/model calls, import/edit/delete/export, database mutation, MCP/client configuration or public deployment, obtain explicit approval for the exact action, data, destination and cost. Do not put credentials in reports.

## Preflight helper contract

Expected helper: `python3 .agent-skills/orionbelt-ontology-builder/scripts/preflight.py --repo /absolute/upstream --json`; from the installed skill root: `python3 scripts/preflight.py --repo /absolute/upstream --json`. It is stdlib/read-only, no subprocess/network/secret-file reads; PATH tool discovery is not a version test. Secure traversal requires Python 3.10+ on POSIX (Linux/macOS); use WSL2 on Windows. Native Windows returns an error rather than weakening symlink protection. It checks selected pinned file hashes only, not Git HEAD, full source, package install or runtime. `runtime_verified` is always false. Exit 0=offline checks passed, 1=missing/mismatched source, 2=invalid input. Do not use `--expect-commit` or claim runtime readiness.
