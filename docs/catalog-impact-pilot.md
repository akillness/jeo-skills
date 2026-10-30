# Catalog validator impact-analysis pilot (in progress)

Observed 2026-10-30 UTC, repository HEAD `6fca26516531292f235e522ecdb305722008314b`; the working tree also contained an unrelated untracked SVG. Target: `scripts/validate-catalog-projections.py`, SHA-256 `b6eb65a46691969f7f477268459bcf27fd05bc6218f1aa9e8b84a1c8c5bba6af`. This is a preliminary investigation, not a complete impact set or a recall evaluation.

## Source-confirmed relationships

- [CI](../.github/workflows/ci.yml#L24-L27) runs the validator's Rule F self-test and the normal validator separately.
- [Skill retirement](../scripts/retire-unused-skills.py#L495-L500) runs the projection generator and then the validator and handles validation failure.
- [Performance regressions](../scripts/test_performance_regressions.py#L761-L804) import the validator and exercise its YAML safe loader alongside other loaders, including unsafe tags and a fallback branch.

These are confirmed relationships, not claims that every validator change affects every listed consumer. `git grep` also found references in `scripts/test_retire_unused_regressions.py`, the generator, and the exception-ledger builder; their exact roles require source inspection. Literal name search cannot find all indirect relationships.

## Baselines and limits

The previously refreshed mex graph reported 53/53 parsed files, 1,903 nodes and 5,520 edges. Its file-level impact result reported 42 matches but returned eight nodes and zero edges with `truncated: true`. It therefore cannot establish completeness or demonstrate that CI relationships are absent from the underlying graph.

The existing zvec index reports 95/95 files in its configured scope, 1,494 entities and two truncated fragments. This is not 95 files out of the entire repository. A single mixed search returned relevant and apparently irrelevant candidates; it does not measure recall. The initial direct indexing attempt failed on an existing daemon's write lease; auto mode reused the existing daemon successfully.

## Open Ontologies feasibility

The inspected upstream checkout is pinned to `dfb09bf815326913d7d7822fa7228f2602fb4976`. Selected-file hash verification was successful but is not full revision or dependency verification. Its [Cargo manifest](https://github.com/fabio-rovai/open-ontologies/blob/dfb09bf815326913d7d7822fa7228f2602fb4976/Cargo.toml) declares version 2.1.0 and patches Oxigraph to Git revision `abf36ef22b61f9c4d810b94b647d500c05ee791c`.

The first `cargo build --locked --offline` failed before compilation because the pinned Oxigraph Git dependency was not cached. After explicit approval for dependency downloads, `CARGO_TARGET_DIR=~/.local/share/open-ontologies-jeo-build cargo +1.99.1 build --locked` downloaded the Git dependency, its submodules and crates and completed successfully in 7m 16s. This is not an independent dependency audit.

A separately approved local CLI smoke test used `--no-connect`, a temporary data directory and batch mode. It loaded three manually asserted Turtle triples derived from the three source-confirmed relationships above; a SPARQL query returned the three expected consumer/relation pairs, exit 0. The temporary input and data directory were removed on exit. This verifies only loading and retrieving these assertions, not automatic extraction, inference, provenance enforcement, completeness or comparative recall. No MCP registration or server was started.


A second isolated batch test verified RDFS reasoning, not just retrieval. Its two input triples asserted the source-confirmed `ci invokes validator` relationship and an illustrative, user-supplied `invokes rdfs:subPropertyOf dependsOn` rule. Before reasoning, a query for `ci dependsOn validator` returned zero rows; `reason --profile rdfs` reported one inference and a fixpoint, and the same query then returned `ci`. The hypothetical rule is not independently established repository semantics. Zero rows before inference means not returned by that query, not proof of falsity. This test did not independently verify a certificate or assess broader rule coverage. Temporary files and data were removed.

On the current host, the selected-file preflight reported six matches and the upstream checkout's `git rev-parse HEAD` returned the pinned commit; neither checks every working-tree file or dependency. Rust `1.99.1` and Apple clang `21.0.0` are present. The manifest has `default = []` and patches Oxigraph to the pinned Git revision; the checked-out Oxigraph `oxrocksdb-sys` manifest lists `bindgen` and `cc` build dependencies. The successful build demonstrates that this host built the selected configuration, not that other feature sets or platforms are ready.
## Reflected into the `open-ontologies` skill (2026-10-30)

The verified procedure now ships with the skill instead of living only in this report. `.agent-skills/open-ontologies/scripts/install.sh` clones the pinned commit, runs `preflight.py`, builds with `cargo build --locked` into a separate target directory, copies the binary to `BIN_DIR`, and runs `scripts/smoke.py`, which repeats the load/query/RDFS-reason/query check above in a temporary data directory with `--no-connect`. The skill version is `1.2.0` in `skills.json` and `SKILL.md`.

Running `install.sh` with defaults on this host found the active cargo `1.87.0` too old — cargo itself refused the locked set because `darling 0.23.0` requires `rustc 1.88.0`, which `cargo metadata --locked` confirms is the highest `rust-version` in `Cargo.lock` — selected the installed `1.99.1` toolchain, built the release profile (3m 13s for the remainder of a build that an earlier interrupted run had partly compiled; about 1 GB of target output), installed `~/.local/bin/open-ontologies` (45.6 MB), and the smoke test passed all four checks. A second run without `--force` rebuilt nothing and refused to overwrite the existing binary with exit 1. The shared installed copy at `~/.agents/skills/open-ontologies` was upgraded through the `jeo-skill install --source … --global --yes` flow; its six files are byte-identical to the catalog, and its `smoke.py` passes against the installed binary. The smoke test remains CLI batch/RDFS evidence only: no MCP transport, certificate checker, other profile, or user data was exercised. Log: `.jeo/artifacts/oo-fresh-install.log`.

## Next evaluation step

Inspect the remaining candidate source locations and establish a reviewable reference set with explicit scope, evidence and commit/hash provenance. Then run documented, repeatable mex and zvec queries against that same set and report each discovered and missed relationship, truncation, and analyst effort. Expand the RDF experiment only with explicitly sourced facts and rules; distinguish asserted facts from rule-derived conclusions and unknown or unsupported results. Neither search hits nor an incomplete hand-reviewed set prove the absence of additional impacts.

The research skill calls for a background agent, but this session did not expose a subagent tool; source review here was performed directly instead.
