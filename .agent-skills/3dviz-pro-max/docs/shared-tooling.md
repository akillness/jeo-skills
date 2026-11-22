# Shared tooling for experiments and collection

Shared scripts implement reusable project rules. Workers should spend their effort on the requested scene, object and model rather than repeatedly building local automation.

## Existing entry points

Run repository commands from the repository root unless another working directory is shown.

| Operation | Existing command | Scope |
| --- | --- | --- |
| Validate canonical data and evidence | `python3 scripts/validate.py` | Structure, references, revisions and evidence linkage |
| Generate catalog pages and summary | `python3 scripts/build-index.py` | Generated catalog artifacts |
| Check generated artifacts | `python3 scripts/build-index.py --check` | Detect stale generated content |
| Preview or apply catalog layout v2 | `python3 scripts/migrate-catalog.py [--apply] [--report <path>]` | Defaults to a read-only preview. `--apply` writes one object per derived recipe/knowledge path while preserving stored IDs, revisions and evidence; `--report` selects the internal migration report path |
| Record revision evidence | `python3 scripts/evidence-log.py snapshot\|propose\|source-read\|claim-checked …` | Appends contract-valid events and snapshots; does not judge truth |
| Check authored retrieval cases | `python3 scripts/check-retrieval.py` | Lexical regression checks, not semantic or visual quality |
| Check public Markdown and JSON examples | `python3 scripts/check-docs.py` | Local documentation integrity |
| Run repository unit checks | `python3 -m unittest discover -s tests` | Existing Python-owned behavior |
| Package skill and plugin | `python3 scripts/package.py --output <directory>` | Local archives and manifests; no installation or publication |
| Search/resolve design guidance | `python3 scripts/search.py "<query>"`, `python3 scripts/resolve.py <record-id>` | Run from `skills/3dviz-pro-max/`; optional catalog helpers. Searches recipes and knowledge together by default (`--collection all`) and expands query terms through the manifest alias table; narrow with `--collection` or `--kind` |
| Prove one blueprint at a tier | `python3 scripts/kit-proof.py --record <blueprint-id> [--tier {T0,T1,T2,T3}] [--gpu] [--check-tag TAG]` | Builds the record's module in an offline harness and captures four framed views plus `proof-log.json`, then appends a `check-run` event. `--tier` defaults to T1 (today's output directory, check id and change id); any other tier writes `evidence/kits/<id>/<tier>/` with its own log and a lowercase-tier check id, so no tier overwrites another. `--gpu` uses the platform's ANGLE backend and `--check-tag` distinguishes a re-proof of the same revision on fixed code. `--motion-check MS` adds a fifth frame by advancing `animate(dt)` in fixed 1/60 s steps. Exit 0 ok, 2 usage, 3 Playwright or the three tree missing, 4 ready-flag timeout, 5 two views byte-identical. It records what headless Chromium drew; it never judges whether the blueprint looks good |
| Discover host tools and kit pipeline capabilities | `python3 skills/3dviz-pro-max/scripts/host-probe.py --out host.json` | Read-only OS/CPU/GPU/Blender/runtime report plus the legacy `quality_ceiling` (scoped by `quality_ceiling_scope: shipped-kit-pipelines`) and `capture_mode_expected`; tool availability does not grade custom/sourced objects or establish executed renders; stdlib only, always exits 0, writes exactly the one file named by `--out`; absence of a tool is data, not an error |
| Bake one blueprint's T3 hero GLB | `python3 skills/3dviz-pro-max/scripts/hero-tier.py --record <blueprint-id> --params '{...}' --out <path>` | Reuses `blender_locate.find_blender()` (the same discovery `host-probe.py` uses) and accepts `--host <probe.json>`; cache key `sha256(module bytes + params + bake settings)[:12]`, GLB lands in `<project>/.cache/hero-tier/`, `--out` refused outside the repository or that cache; every Blender run is `nice -n 10`, `--threads 4`, one at a time, time-boxed (`--timeout-s`, default 120) with the process group killed and the partial file deleted on expiry. Exit 0 produced / cached / unavailable / timed out / `--no-hero-tier`, 1 Blender failed, 2 usage |
| Recommend a tier per blueprint | `python3 skills/3dviz-pro-max/scripts/design-context.py "<objective>" --blueprints --host host.json --delivery web-desktop --hero <blueprint-id>` | Adds a `quality_brief` (role, tier, reason per blueprint) from the probe and what each record declares; recommendations, not limits; run from `skills/3dviz-pro-max/` |
| Capture frames of a built scene | `python3 skills/3dviz-pro-max/scripts/capture.py --dir <dist> --all-views --click <css>` | Playwright screenshots, capture log and console output; needs the viewer contract or `--ready-flag none`; optional Playwright, exit 3 when absent; no visual judgment. `--gpu` launches the platform's ANGLE backend (measured on darwin: `--use-angle=metal`), `--format {png,jpeg}` with `--quality N` chooses the encoding, and every run records the observed `webgl_renderer` and `capture_mode` in `capture-log.json`. Every capture also carries `view_quality` — `luma_mean`, `luma_std`, `dark_fraction`, `flat_fraction`, `wall_fraction` and a `usable`/`reason` verdict measured in the browser on the scene canvas region (`capture_view_quality.py`, one threshold dict) — plus the run's `unusable_views`; `--expect-usable` exits 6 when the default frame or a named view is flagged `near-black`, `flat-occluder` or `low-contrast`. It measures; it still never judges whether a frame looks good |
| Render new showcase stills | `python3 scripts/showcase.py --manifest <new-manifest.json> --out docs/demos/showcase/<new-run> [--only ID] [--force] [--budget-s 1800] [--dry-run] [--python <interpreter>]` | Drives `capture.py` sequentially. A standalone source is `example:<folder-id>` and uses the matching `examples/dist/<folder-id>/` page; proof sources remain `harness:<blueprint-id>[@TIER]`. The output must be a new subdirectory: the historical gallery root, JPEGs and log cannot be overwritten. Each run writes its own images, `showcase-log.json` and lock. Quality steps 88 → 80 → 72 against `max_bytes`; exit 0 ok, 1 shot/lock failure, 2 usage/manifest failure. It records what Chromium drew and never supplies an artistic verdict. |
| Build the standalone examples | `pnpm build` | Run from `examples/`; emits all independently addressable pages below `dist/` |
| Serve the standalone examples | `pnpm dev` | Run from `examples/`; open the subject path listed in `examples/README.md` |

These commands do not yet constitute a shared Blender scene generator, universal render runner, glTF fidelity checker or physics validation engine. Do not describe a planned command as installed or tested.

`migrate-catalog.py` shows the record/file counts and baseline hashes unless `--apply` is present. An applied run keeps rollback data in an internal backup companion to its report; neither file is dataset evidence, and neither changes record revisions. Use the report to inspect the exact move, then run validation and content/retrieval comparisons before describing the migration as verified.

The skill's `templates/` directory ships text starting points (`.md`, `.js`, `.html`, `.css`) rather than an installable project. Copy a scaffold or rig out of the skill folder before running `pnpm install`; nothing under `templates/` can be built in place, and no repository check installs it.

## Before adding tooling

1. Search the command inventory, relevant package scripts and existing shared implementation.
2. Reuse a supported command. Keep artifact-specific options in data or parameters when its interface supports them.
3. If a capability is missing, propose it to the main agent with existing callers, at least the concrete current use and plausible reuse, expected inputs/outputs, scope and failure cases.
4. The main agent selects reuse, a shared extension, a new focused shared command, a direct existing tool command, or deferral. Workers do not independently create local helper scripts or script copies.
5. Implement an approved shared change in its owning module, preserve compatible callers and run checks that verify the changed application-owned contract. Update this inventory when a command is actually available.

Useful common interfaces may include artifact and asset paths, named scenes, backend selection, coordinate/unit conventions, output directories, deterministic seeds and explicit check scope. Include only parameters supported by actual work. Scientific tolerances and material/model assumptions belong to the subject's data or explicit options rather than hidden per-scene branches.

A shared command should produce actionable errors and distinguish failed checks, unavailable tools and unrun observations. Reusing a script never upgrades a previous source review into an observation of the current artifact.

## Ownership and scope

The main agent owns shared-script decisions. Collection workers own their assigned records and sanitized evidence; experiment workers own their assigned artifact code. Rendering, headless execution, installation, performance investigation and publication remain subject to the user's task scope.

Historical private helper scripts are not automatically approved shared entry points. Review actual reuse and move useful functionality into the shared tool layer before relying on it across new experiments. Do not delete or rewrite in-flight research tooling merely to tidy the directory.

## Optional Blender discovery

For substantial asset work, follow the skill’s [Blender CLI discovery and adoption guidance](../skills/3dviz-pro-max/references/blender-threejs-handoff.md). Reuse direct executable discovery and `--version`; this does not require a new wrapper or render runner. Availability and successful version output do not establish GPU, Python API, exporter or artifact correctness.
