# Contributing data

Author records in the canonical [`skills/3dviz-pro-max/`](../skills/3dviz-pro-max/) tree. Read the current schema and nearby records before editing; their actual fields and allowed values define the machine contract. This guide defines the evidence and editorial expectations.

## Dataset layout and portable paths

Layout version 2 stores one JSON object per authored record. A recipe with ID `recipe.<slug>` lives at `data/recipes/<slug>.json`; a knowledge record with ID `knowledge.<slug>` lives at `data/knowledge/<exact-knowledge-kind>/<slug>.json`. The validator derives both locations from record content. `direction_ids` remains routing metadata: its order has no primary-direction meaning, and recipe storage does not follow a direction. `sources.json` and `directions.json` remain JSON arrays.

Loaders retain layout version 1 array support so historical trees remain readable. A layout version 2 recipe or knowledge file must contain one object, not an array. Moving a record without changing stored fields preserves its ID, revision and content evidence; do not bump a revision or fabricate evidence events for a layout-only move.

Any path serialized into JSON, Markdown, a hash input or reusable stdout is a relative POSIX path with no `..` or backslash. Catalog `_path`, `asset.path` and `proof.harness` use the skill root as their base. Evidence `artifact_ref`, `output_ref`, snapshot paths and kit captures use the repository root.

Generated `catalog-summary.json` reports `hash_scope: "all-records"` and two hashes with distinct responsibilities. `content_catalog_hash` is SHA-256 over canonical compact JSON of rows `[id, revision, record_content_hash]`, sorted by ID; each record hash covers all stored record fields, excludes loader-added `_path`, and does not include sources or manifest/search configuration. `layout_hash` is SHA-256 over canonical compact JSON of `[id, skill-relative-path]` rows sorted by ID. The existing `catalog_hash` and `bundle_hash` remain loaded-view hashes whose inputs include loaded paths; POSIX serialization only removes the platform-separator difference. Runtime commands do not load unrelated collections solely to produce the summary-only all-record hashes.

## A useful recipe

A recipe should address a distinct task: what the viewer learns or does, which entities and relationships matter, how interaction changes state, and what would make the result incorrect. Include geometry, motion, camera, and presentation guidance only where they help. Allow aesthetic alternatives rather than turning every scene into a fixed template.

Keep record identities stable. Titles and aliases should name the task precisely. Use meaningful English examples and discriminating terms; do not stuff keywords or copy a whole taxonomy. Negative signals describe mismatches and must not become positive search text. Sources and evidence establish grounding, not search relevance.

The retrieval manifest indexes titles, aliases, summaries, objectives, tags, intent signals, example prompts, subject terms, applicability conditions and the feeling words in `defaults.values.feeling`. Put canonical domain vocabulary in `subject_terms` and realistic task wording in `intent_signals`; keep source prose and mismatch descriptions out of positive search fields. Write `applies_when` as explicit modeling conditions; a lexical hit does not prove those conditions hold. Field weights are configurable defaults, not measured semantic quality.

## Sources and claims

For new claims or changed factual meaning:

1. Identify the exact claim, assumptions, applicable units/conventions, and limitations.
2. Read a suitable authoritative source. Prefer primary papers or official documentation where appropriate.
3. Record a locator precise enough to find the supporting passage, the source version or access date, and the supported claim IDs.
4. Explain the verification scope and remaining uncertainty. A URL resolving successfully is not claim verification.
5. Cross-check the modeled and rendered result where the claim affects the scene.

Creative choices need a concise rationale, not fabricated citations, and tuned starting numbers belong in the `defaults` block described below rather than in a claim. Summarize sources in your own words; do not commit full copyrighted texts or assets without permission.

## Authored defaults

A record may carry a `defaults` block: starting numbers (palette hex, fog density, light intensity, FOV, roughness ranges, timings, model parameters) plus a one-paragraph `rationale`. `provenance: authored` means the numbers are a tuned creative proposal: no citation is required, `tunable` is true, and the record's `known_limits` must state the tone mapping/exposure or model regime they were tuned for. `provenance: source-backed` means the numbers restate a source; list the supporting `claim_ids`. Every listed claim ID must be a claim of the same record. Authored defaults are not factual claims and must not be cited as such; source-backed defaults follow the ordinary claim/source evidence. Prefer defaults with rationale over prose that asks the agent to invent every number.

## Change evidence

Every dataset-changing pull request includes its record IDs/revisions and `evidence/dataset-changes/<change-id>/events.jsonl`. Use the implementation's event contract and validator; do not invent fields or treat an illustrative example as an observation.

The log should connect the proposed/curated change, source reads, claim checks, actual check runs, and any status change. Include before/after content hashes as required by the contract; a new record has no before content. Record the base revision when known. Do not embed a commit's final hash into the commit itself.

For a revision change, preserve the previous record before replacing canonical content. A portable snapshot is one JSON record object at `evidence/dataset-changes/<change-id>/snapshots/<collection>/<record-id>/<revision>/<sha256>.json`, where the digest uses the event contract's canonical JSON content hashing, not the formatted file bytes. Collection must be `recipes` or `knowledge` and agree with the record ID prefix. The path, record identity, integer revision and content digest must agree; traversal and repository-escaping links are rejected.

Set the new proposal's `before_ref.provenance_ref` to `snapshot:sha256:<digest>:<repository-relative snapshot path>`. Existing `git:<40-character commit>:<JSON path>` references remain supported when that real commit is available. Never invent a Git reference for a workspace without history. Earlier immutable event references without a provenance field resolve through the unique matching snapshot in this constrained layout. Reuse the existing snapshot rather than creating duplicate locations for the same historical identity/revision; ambiguous discovery fails validation.

Keep the old event logs unchanged, add the new change/curation events, and distribute the snapshots with the repository evidence needed to validate its history. If another revision is promoted later, preserve that revision in turn. See the [water revision proposal and snapshot references](../evidence/dataset-changes/water-surface-coverage/proposal.json) for an accepted example. A snapshot proves content linkage, not source truth, runtime behavior or trusted authorship.


A spelling-only edit may use one change event. It does not need fresh research if meaning is unchanged. An existing checked record does not automatically remain checked after a factual change: state what evidence still applies and what must be rerun.

## Observed checks

A behavior-tested status requires actual checks linked to the artifact revision and recorded outcome. Include the method, relevant inputs, observer, and evidence location. Numerical comparisons should state their tolerance and applicable regime. Report failure, unavailable tooling, and skipped or unrun checks honestly.

Visual checks use the rendered artifact. Inspect camera framing, meaningful geometry, labels, state transitions, and controls relevant to the recipe. A screenshot can show appearance; it cannot by itself prove an inverse operation, reset behavior, or correct animated state.

For demo submissions, include the original prompt, meaningful revision turns, model/host/runtime versions, artifact revision, screenshot or clip provenance, asset rights, and actual test description. Do not claim one-shot generation when revisions occurred.

## Before submitting

- Validate changed records, references, and event logs with the current repository checks.
- Rebuild generated indexes/packages through the repository tooling when the change requires it; do not hand-edit copies.
- Confirm evidence links remain useful outside your machine and contain no private paths or credentials.
- Keep public logs concise. Follow the [evidence policy](../evidence/README.md) for corrections and private working files.
- State what was checked and what remains uncertain in the pull request.

Structural CI verifies the repository's contracts. It does not establish scientific truth, aesthetic quality, or real-host compatibility from metadata alone.

## Object detail and physical behavior

Recipes should add topic-specific knowledge about important object parts, materials and articulation, using the skill's [object craft](../skills/3dviz-pro-max/references/object-craft.md) reference where useful. Quality is not a count of props or polygons.

When the subject involves contact or motion in shared space, record the applicable physical role, collider/envelope, authoritative position/velocity, acceleration/steering limits, support, timestep and interaction checks. Use [physical interaction](../skills/3dviz-pro-max/references/physical-interaction.md) as a reasoning guide, not a compulsory engine choice. Existing conditional state, invariant and guidance fields can carry these decisions. Separate true dynamic simulation, controlled locomotion and display transforms. Sources establish factual meaning; artifact evidence establishes the tested implementation.

Optional structured fields are validated without making them mandatory for unrelated topics:

- `object_craft`: entries with `family`, `structure`, `material`, and optional `articulation`.
- `physical_contract`: `model` and `scope`, with optional `state`, `colliders`, `driving`, `contact`, `timestep`, and `checks`. Models distinguish display transforms, controlled locomotion, rigid-body behavior, numerical dynamics, and no physical interaction.

These fields describe authored intent and verification requirements; their presence does not mean a solver or rendered artifact has been tested.

## Reusable knowledge and feedback

Use a recipe for an end-to-end subject. Use the optional `knowledge` collection for a decision that transfers across subjects: object archetype, material profile, physical behavior, tool adapter, inspection pattern or validation profile. Each knowledge record has the shared identity/source fields, a `knowledge_kind`, `content.principles`, `content.implementation`, `content.observable_checks`, and optional `related_ids`. The current schema validates these fields and relationship targets.

Style and theme profiles are separate families: a surface/shape treatment may combine with many fictional settings. Author creative proposals as such; research factual optical, historical or cultural claims rather than hiding them inside an aesthetic record. See [coverage accounting](dataset-coverage.md) for how the logical content axes map to the current storage and what remains incomplete.

Presentation, composition, motion and interaction profiles separate how information is exposed, how the scene is framed, how state is displayed over time and how a viewer acts. Keep their responsibilities connected through `related_ids` instead of duplicating an entire recipe. Adding a record or file in an existing knowledge kind is a data change discovered by the manifest glob. A new subject does not require a new kind. Introducing a structurally different knowledge kind requires coordinated schema, kind-registry and any kind-specific tooling changes, with retrieval and packaging checks.

Reasoning rules require `applies_when` and `constraint_level: advisory|correctness`. Reserve correctness for an applicable domain invariant or exact application contract; do not encode aesthetic preferences as prohibitions. Domain-validation records require `applies_when` and `check_method: analytic|state|geometry|source|interaction|visual`. Describe reproducible inputs, scope and expected observations in their content. Authored verification procedures are not executed tests.

External authoring sessions should write new records and sanitized evidence into separate staging locations. Before integration, check global IDs, source linkage, exact content hashes, unchanged existing records and the semantic substance of new claims. Keep raw session logs private. Explicitly record the authoring model and review scope when relevant, without treating a model's self-report as proof that a source was read or an artifact ran.

Write principles that change modeling decisions, implementation guidance that assigns responsibility, and checks with visible consequences. For example, a rigid-body adapter should explain who owns transforms and how contact becomes observable. Do not equate a material's optical roughness with friction or imply that an animation clip computes forces.

Keep aliases and search terms specific to the missing decision. Search covers both collections by default; use `--collection`/`--kind` to narrow. The manifest's `query_aliases` table expands craft phrases into catalog vocabulary, so prefer authoring the vocabulary a record actually owns over adding an alias for every phrasing. Add representative retrieval cases without calling them a held-out quality benchmark.

When learning from a demo, save a sanitized observation under `evidence/feedback/`, distinguish it from your inferred cause, and connect the resulting records through their change evidence. Preserve the feedback even when a structural check passes: data validity does not answer an aesthetic criticism. State what was actually demonstrated and what remains a hypothesis for the next artifact.

Knowledge changes use the same revision, hash, source and claim evidence discipline as recipes, with `collection: knowledge` in record references. Runtime evidence belongs to the concrete artifact and tested behavior; a curated record alone has no runtime pass.

## Add a blueprint

A blueprint is three artifacts that must agree, and a change is not finished until all three do: a record at `skills/3dviz-pro-max/data/knowledge/blueprint/<id-without-knowledge-prefix>.json`, a module under `skills/3dviz-pro-max/templates/kits/<group>/<name>.js`, and a proof made of real captures under `evidence/kits/<record-id>/`. The [kits README](../skills/3dviz-pro-max/templates/kits/README.md) holds the module-side rules; this section is the data side.

The module contract is one exported factory, `create(params)` unless the record's `asset.factory` names another, returning `{ group, sockets, colliders }` and optionally `animate(dt)`. `group` is a `THREE.Group` standing on `y = 0`; `sockets` are `{ name, position_m, normal }` descriptors the record repeats verbatim; every random choice routes through the `seed` parameter so a proof run is reproducible. A `.glb` asset is the one exception: its `create` returns a Promise, and its record points at the `.glb` while the callable is the sibling `.js` wrapper.

The record adds `asset`, `params`, `sockets`, `detail_ladder`, `footprint_m`, `poly_budget`, `fits_looks` and `proof` to the shared knowledge fields. `params` declares each parameter type and default. Numeric parameters may declare a two-number `range`, the authored/proved band rather than a runtime limit; its endpoints must be finite and ordered and contain the declared default. Boolean, string, enum and color parameters do not declare numeric ranges. `detail_ladder` names what a viewer sees in the silhouette, medium and fine bands; the starting numbers are in `knowledge.hero-detail-ladder-defaults`. `fits_looks` may only name style, theme or lighting records, because `design-context.py --blueprints --look <id>` filters on it.

### Quality tiers

A record may also declare `tiers`: the qualities this blueprint can actually be built at. **T1 is never written** — it is the record's own `asset` and `proof`, which the validator synthesises, so no existing record is restructured. A record declaring T1 is refused.

| Tier | `mode` | What it is | What it ships |
| --- | --- | --- | --- |
| T0 | `proxy` | blockout box | nothing: `size_m` (three positive metres), no asset, no proof |
| T1 | `module` | today's kit module | the record's own `asset` + `proof` (never declared) |
| T2 | `runtime` | the same module with procedural textures, vertex occlusion and imperfection | nothing: `families` (a lowercase `#rrggbb` colour mapped to one of `wood`, `plaster`, `stone`, `roof-tile`, `metal`, `fabric`, `fur`) and `poly_budget`; naming an `asset` is refused |
| T3 | `gltf` | a Blender-baked hero | an `asset` of kind `gltf-asset` under `templates/kits/`, at most 2 MB, when `status: "proved"` — otherwise `status: "missing"` with a `note` and no asset |
| T4 | `external` | an asset from outside this repository | nothing; `status` may only be `missing` or `declared` |

Every tier carries a `status` of `generated`, `declared`, `proved`, `not-proved` or `missing`, and no other keys than the ones its mode allows. A `proved` tier needs a `proof`, and its captures live in **its own** directory, `evidence/kits/<record-id>/<tier>/`, with their own `proof-log.json` — same basenames as T1, different directory, so the two never collide. A tier that does not look better than the one below it is declared `not-proved`; missing tiers are declared, never faked.

```json
{
  "tiers": {
    "T0": { "mode": "proxy", "size_m": [4.54, 4.73, 4.13], "poly_budget": 12,
            "status": "generated", "note": "Bevelled box from the proof log bounds_m." },
    "T2": { "mode": "runtime", "poly_budget": 3468, "status": "proved",
            "texture_budget": { "maps": 3, "resolution": 1024, "families": 4 },
            "families": { "#e5dccb": "plaster", "#6b4f34": "wood", "#8d5a4a": "roof-tile" },
            "ao": { "samples": 24, "radius_m": 0.45, "ground_dirt_m": 0.6 },
            "proof": { "harness": "templates/kits/_harness/index.html", "detail_socket": "door",
                       "captures": ["evidence/kits/knowledge.blueprint-cottage/T2/far.png",
                                    "evidence/kits/knowledge.blueprint-cottage/T2/mid.png",
                                    "evidence/kits/knowledge.blueprint-cottage/T2/close.png",
                                    "evidence/kits/knowledge.blueprint-cottage/T2/detail.png"],
                       "log": "evidence/kits/knowledge.blueprint-cottage/T2/proof-log.json" } },
    "T3": { "mode": "gltf", "status": "missing", "note": "No hero is baked yet." },
    "T4": { "mode": "external", "status": "missing", "note": "No external asset ships." }
  }
}
```

Adding or changing a tier is a record edit, so it follows the frozen sequence: snapshot, edit and bump the revision, prove the tier, then propose.

```sh
python3 scripts/evidence-log.py snapshot --change-id kits-quality-tiers \
  --record knowledge.blueprint-<name>
# edit the record: add or change the tier, revision += 1
python3 scripts/kit-proof.py --record knowledge.blueprint-<name> --tier T2
python3 scripts/evidence-log.py propose --change-id kits-quality-tiers \
  --record knowledge.blueprint-<name> --actor <name> --runtime-status passed \
  --artifact evidence/kits/knowledge.blueprint-<name>/T2/close.png \
  --summary "<what the tier adds>" --rationale "<why the numbers are acceptable>"
```

`--tier` defaults to `T1`, which keeps today's output directory, check id and `kits-blueprints` change id unchanged. Any other tier writes `evidence/kits/<record-id>/<tier>/`, records the tier (and, at T2, the `families`, `seed`, `size` and `ao` settings it drew with) in that tier's proof log, and defaults its change id to `kits-quality-tiers`.

Not every module earns a record. `primitives/` are composition parts proved inside a building's capture, and `layout/village-layout.js` plans plots rather than building geometry; both ship as modules with no record, so nothing in the catalog claims a proof that does not exist.

Prove it, then log it:

```sh
python3 scripts/kit-proof.py --record knowledge.blueprint-<name>
python3 scripts/evidence-log.py propose --change-id <change> --record knowledge.blueprint-<name> \
  --actor <name> --runtime-status passed --artifact evidence/kits/knowledge.blueprint-<name>/close.png \
  --summary "<what changed>" --rationale "<why it is acceptable>"
python3 scripts/evidence-log.py check-run --change-id <change> --record knowledge.blueprint-<name> \
  --actor <name> --check-id kit-proof.<name>.r<revision> --method visual --status passed \
  --artifact evidence/kits/knowledge.blueprint-<name>/close.png --observed-by <name> \
  --observed-result "<what you saw in the frame>" --summary "<what ran>"
```

`--motion-check MS` adds a fifth capture for a blueprint with `animate`, and exits 5 if the two frames are identical. A runtime pass needs both the curated event and the passing check-run to cite the same artifact path, so build both from the capture the proof actually wrote.

Size and honesty rules the validator enforces: the asset lives under `templates/kits/` with no path traversal, its suffix matches its `asset.kind`, it is at most 2 MB (a `.glb` over the cap fails `validate.py` before it can be packaged), and every declared capture exists with the SHA-256 its proof log states. No `.blend` is committed — a Blender asset is regenerated from its script.

A blueprint carries `claims: []`. Authored geometry asserts nothing about how a real building, tool or creature is made, so it cites no source and needs none; say so in `known_limits`. A blueprint that does make a factual claim — a mechanism that must work the way the real one does — needs sources and claim evidence like any other record.

## Discovery escalation and shared tooling

A collection worker stays within its assigned record scope. If research reveals a new domain or substantial topic, send the main agent its modeling gap, overlap with current record IDs, reusable value, primary-source candidates, proposed existing family and bounded collection scope. Record the proposal privately with the active plan. The main agent records whether to accept, merge, defer or reject it and assigns ownership before another worker starts. A new topic does not by itself justify a new dataset family.

Reuse [shared scripts](shared-tooling.md) and their supported interfaces for experiment and dataset operations. Propose missing reusable capabilities to the main agent; do not create a worker-local script or copied validator to bypass the shared contract. Ordinary record data, evidence logs and scene implementation remain worker deliverables. Main-agent decisions should appear in sanitized contribution evidence when they change the accepted data scope.
