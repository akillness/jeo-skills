# CocoIndex source-grounded notes

Inspected at `cocoindex-io/cocoindex` commit `1639793b3602408a9cb220728fb30e306d433473` on 2026-10-16. The notes paraphrase selected public pinned source; this is not a live installation or pipeline execution.

## Product model

The pinned README and quickstart describe a Python-declared incremental dataflow: source state is transformed into target state, with memoized components reused when their input/code state is unchanged. A `coco.App(...)` binds the flow function and inputs/outputs; the quickstart demonstrates `update_blocking()` and the CLI `cocoindex update main.py`. CocoIndex is an incremental ETL/indexing framework, not a database or vector store. It can write to different target systems; its own state database tracks pipeline progress and target-state ownership. Knowledge-graph examples use graph databases as targets and do not make CocoIndex an ontology.

## Setup and CLI

The pinned `pyproject.toml` declares Python `>=3.11`, Apache-2.0, a Rust/maturin build backend, and core dependencies including Click, watchdog and NumPy. The README quick install is `pip install -U cocoindex`; the PDF quickstart separately installs `docling`. Connector and transform dependencies vary by flow.

CLI docs at this pin define `cocoindex update [OPTIONS] APP_TARGET`, where the target can be a Python path, module, and optional app name. Normal update runs catch-up; `--live` continues after initial processing. `--preview` computes planned target actions. `--full-reprocess` bypasses memoization and re-runs external calls such as embeddings. `--reset` drops existing setup before update. The documented `drop` operation reverses app target state (examples include dropping tables/deleting rows) and clears the internal state database. Use `--help` from the exact installed checkout before invoking a command; flags and target naming may change.

Illustrative approved sample:

```bash
pip install -U cocoindex
cocoindex update --preview main.py
# After reviewing intended actions and approving target writes:
cocoindex update main.py
```

The quickstart uses `.env` to configure an internal database path. Do not expose secrets in that file or logs; understand which connectors read credentials and where they send data. Installing a connector, contacting an external source/target, and executing a pipeline are separate approvals.

## Effects and caveats

- `update` can create, update, or remove target outputs and internal state, based on source changes. A source deletion can delete the corresponding target output.
- `--full-reprocess` can repeat paid/provider operations and intentionally defeats caching; inspect flow code for API calls and ask for a budget ceiling first.
- `--preview` is described as planning actions rather than applying them, but validate the exact local version and connector semantics before using it as a safety guarantee.
- `drop` and `--reset` are destructive. Inspect the app target and back up state before any approved use.
- A target database is externally managed; CocoIndex does not replace schema design, database availability, permissions, backups, or migration planning.
- README marketing measurements are context-specific and are not repeated here as general performance guarantees.

## Source map

See [source.json](source.json) for the 40-character pin, license and SHA-256 for each selected raw source. Downloaded source marker files for parent's true-pin smoke check are at `tmp/knowledge-sources/cocoindex/`.

- [README at pinned commit](https://github.com/cocoindex-io/cocoindex/blob/1639793b3602408a9cb220728fb30e306d433473/README.md)
- [Python manifest](https://github.com/cocoindex-io/cocoindex/blob/1639793b3602408a9cb220728fb30e306d433473/pyproject.toml)
- [CLI contract](https://github.com/cocoindex-io/cocoindex/blob/1639793b3602408a9cb220728fb30e306d433473/docs/src/content/docs/cli.mdx)
- [Quickstart](https://github.com/cocoindex-io/cocoindex/blob/1639793b3602408a9cb220728fb30e306d433473/docs/src/content/docs/getting_started/quickstart.mdx)
- [Apache-2.0 license](https://github.com/cocoindex-io/cocoindex/blob/1639793b3602408a9cb220728fb30e306d433473/LICENSE)
