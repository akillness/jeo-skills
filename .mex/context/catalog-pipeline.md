---
name: catalog-pipeline
description: How the .agent-skills catalog manifest stays in sync with its generated projections (TOON, README, SKILL.md frontmatter) and how the frontmatter-freeze/exception-ledger mechanism (Rule F) works. Load when adding/editing skills, changing skills.json, or diagnosing a catalog validation failure.
triggers:
  - "skills.json"
  - "catalog validation"
  - "manifest"
  - "TOON"
  - "rule F"
  - "exception ledger"
  - "frontmatter frozen"
  - "link census"
edges:
  - target: context/architecture.md
    condition: for the higher-level component map this file zooms into
  - target: context/decisions.md
    condition: for why frontmatter parsing moved from regex to PyYAML and why CI never mutates
  - target: patterns/catalog-metadata-changes.md
    condition: when actually adding a skill or editing metadata, not just understanding the pipeline
  - target: patterns/debug-catalog-ci-failures.md
    condition: when a validation stage described here is actually failing
grounds_to:
  - node: "function:39bf96d64d80b27fa57ef4bb8138a7d9"
    fingerprint: "mh:64:7b226d696e68617368223a5b31383134343139392c313134333135323739362c3836333436343639302c3234333834363135342c313330313436373933352c323431313835323434332c3135313431343531372c3536333530333831372c313431393035343033302c313430343338393131352c3135303738303934362c3132353037333139332c3935383231393537352c3434343834313132332c3735393330393530302c32373732313037342c3737363234303335342c3832373734363539372c3135303733353532342c31363538383035392c3338303134343636332c323032363037353137312c3331333536323535312c313434303332363937382c3239333632393835382c3731333331303832372c3334383434343538322c3231333137393432312c3430313436353230392c3337353531393738352c3631323437303432302c3538353336313531342c3435333330333332342c3534313139313834392c38383736343531392c3531373337383830322c3539333438303139312c31303836393338392c3539363233303931302c3737393034383135362c3534333038363534362c313036333233303230332c3435353336313934352c3437303938363532372c313030393030373336302c3132393138363339382c3339383634353135382c3435343439313636392c3431333033353737322c3132303632313938342c3638393733383734312c3331373831383530332c313735383835303631312c3631353736383632312c3632393534373037382c3639393438333633352c3133363036323735352c3638333539333932392c3535303538333235322c3932333131303830392c313736383933333631382c313231393135343139352c3133303139353939332c31313732363932355d2c226e65696768626f7273223a5b5d2c22746f6b656e436f756e74223a397d"
  - node: "function:1e2ae95a88889a2d83570568d11bdbbf"
    fingerprint: "mh:64:7b226d696e68617368223a5b3131343631393938322c3831313632383931392c3535343138313333312c3538353635383535302c3336373033313830342c31333935383132322c33383930363239322c313333323531362c3838333531383431362c313734393433313738302c31373931303839362c31353036333739382c3131363239313633352c31313339363436382c3132353837333133342c3437373732323937312c31333730383836312c3730323138383530332c313737303737303839342c313530373030383930302c3230303636383733392c3131373238333032392c3331313630383534372c3338383036383234352c3339323230383933362c33383037373835342c3232383635303630392c3231343439373833302c3532323532333738302c38353335323039392c3634353532333738302c34363133353431362c343431393134332c3339333238313938392c3538333239363636322c37303332343730382c3333343337333931302c33323534303538322c3236363830353131362c3436313335343136392c313134393631333033352c3931343238383733352c31323836373537382c313530313037303839302c3438303138303130382c3230383939353237362c3232333035303135312c3130333039313135382c3130373638323037332c37373636343333372c3634353532333738302c313035363235393334362c37333131393833372c3539333438303139312c34313330333537372c37303230383532362c35343139343937332c313830313638392c31373639393239372c33393933323732372c39323335363338382c3232343233383839372c31313732363932355d2c226e65696768626f7273223a5b2266756e6374696f6e3a666534373238313037613764366636663432306630346636383830373265666161225d2c22746f6b656e436f756e74223a34317d"
  - node: "function:1732bf6d2890b7d1007cbf734667a514"
    fingerprint: "mh:64:7b226d696e68617368223a5b31373930343734322c37333136333431352c33303336373738352c333534353038352c33343836393837352c393635343732332c32353436393739372c333634333031332c32353331383030302c31313130393635372c31373931303839362c333831333136362c31373431353239352c31383537323237312c31333430363632392c32373732313037342c32353735313033332c31383232353833342c3130383233333933362c31333438373734382c35383138323739332c31323134333537382c31373338313333312c393832393038372c36303931383634302c34393338373230332c37333230343038392c31363631333034382c35383735303930382c313634363838322c343935383038362c32353032353638372c343431393134332c363535333433312c38383736343531392c31343335383532302c393738373332302c31333730383630332c35363534363237342c32303830363637392c32313136363535352c3131363938353835312c31333034363236372c31303236373233342c383331303935362c32383031333735312c32313931353137322c31383937333836322c3130393038363238322c36323530353438362c32383034353339322c37333535363435332c31383737353335302c32313331353230302c3130393838363433302c37303230383532362c34353434373134302c32313230303531332c38333630383837312c34383638383035342c31323330333835362c37373637393735362c32333032383630312c31313732363932355d2c226e65696768626f7273223a5b2266756e6374696f6e3a3164376539623533656437393663343832386436613739306534336365633161222c2266756e6374696f6e3a3165326165393561383838383961326438333537303536386431316264626266222c2266756e6374696f6e3a3638353133326462633066653932323832313136383832613734346338353133222c2266756e6374696f6e3a3639363931613434656564666561356562646436653330303437633933646339222c2266756e6374696f6e3a6135633934383661633262353337393066623965343836616164303230646366225d2c22746f6b656e436f756e74223a3533357d"
last_updated: 2026-09-18
---

# Catalog Pipeline

This project's closest thing to a "build system" is a one-directional projection
graph, kept honest by a single read-only validator. This file is the deep-dive; see
`context/architecture.md` for how it fits the rest of the repo.

## What syncs with what
`.agent-skills/skills.json` is the single manifest. Three artifacts are *projections*
of it and must never drift from it:
1. `.agent-skills/skills.toon` — a compact pipe-delimited catalog, one line per skill:
   `name|category|subcategory|interface|path|description`.
2. `README.md` / `README.ko.md` / `README.es-ES.md` — human-facing category tables
   with English, Korean, and Spanish headings validated independently.
3. Each `.agent-skills/<name>/SKILL.md` — its frontmatter `description` must resolve
   consistently against the manifest's `description` for that skill.

`scripts/validate-catalog-projections.py` (693 lines) is the fail-closed gate for all of
this, and `scripts/generate-catalog-projections.py` (added 2026-09-18) is its mutating
inverse: it rewrites projections 1 and 2 from the manifest — TOON records plus the README
heading counts, subcategory lines, table rows, and intro count — and leaves every other
byte untouched, so `--check` doubles as a drift proof. The validator never edits a file — every check funnels through a `require(condition,
message)` helper that raises `ValidationError`, caught once in `main()` (exit 1).

## Validation stages, in `main()`'s actual call order
1. [`validate_manifest()`](mex://function:39bf96d64d80b27fa57ef4bb8138a7d9) — the
   structural core. Checks `skill_count == len(skills)`, no duplicate names/paths, every
   skill's manifest `path` survives `safe_manifest_path()` (must end in
   `<name>/SKILL.md`, no absolute path, no `..` escape), every skill belongs to exactly
   one `categories[]` entry and one `subcategories[category][subcategory]` entry,
   `bundles[]`/`retired_skills`/`relationship_groups` only reference known skill names,
   and — critically — the live set of `.agent-skills/*/SKILL.md` files on disk equals
   the manifest's declared path set exactly (no orphan folder, no missing manifest
   entry).
2. `validate_toon()` — every manifest skill name has exactly one `skills.toon` line.
3. `validate_skill_documents()` — each SKILL.md is actually loadable and its frontmatter
   description is consistent with the manifest's `manifest_descriptions()` entry.
4. `validate_readme()` (called three times: `README.md` with English headings,
   `README.ko.md` with Korean headings, and `README.es-ES.md` with Spanish headings)
   parses each localized skills-list section and diffs its category tables against the manifest.
5. [`validate_frontmatter_frozen()`](mex://function:1e2ae95a88889a2d83570568d11bdbbf)
   ("Rule F") — the exception-ledger check described below.
6. `validate_links()` — only runs when `--strict-links` is passed (the default CI
   invocation in `.github/workflows/ci.yml` does **not** pass it, so dangling relative
   markdown links are not yet a hard CI failure).

## Rule F: the frontmatter exception ledger
Some SKILL.md frontmatter blocks are intentionally frozen (hand-verified, known-good)
and must not be silently rewritten again by tooling. `scripts/build_exception_ledger.py`
builds/maintains that ledger; `validate_frontmatter_frozen()` reads it back via
`_parse_ledger()` / `_validate_retired_ledger()` and fails CI if a frozen entry's content
hash moved without the ledger being updated to match. A dedicated CI step,
`validate-catalog-projections.py --self-test-rule-f`
([`self_test_rule_f()`](mex://function:1732bf6d2890b7d1007cbf734667a514)), exercises the
active/incomplete/retired ledger states directly so the enforcement mechanism itself
can't quietly regress into a no-op — this is the "Rule F lifecycle remains fail-closed"
step in `.github/workflows/ci.yml`, run *before* the regular projection check.

## The mutating counterpart: frontmatter repair
`scripts/repair-skill-frontmatter.py` is what actually fixes a broken frontmatter block:
`load_sources()` gathers known-good descriptions from `skills.toon`, the manifest, and
`setup-all-skills-prompt.md`'s keyword table; `repair_document()` rewrites only broken
entries as properly folded YAML block scalars and leaves healthy documents
byte-identical. Run with `--check` for a non-mutating CI audit; run bare, locally, to
actually fix a document.

## Gotchas
- Never wire `repair-skill-frontmatter.py` or `flatten_skills.py` into CI without their
  non-mutating flag — see `context/decisions.md` for the incident this guards against
  (26 corrupted descriptions, reintroduced every PR).
- Changing a skill's manifest `category`/`subcategory`/`path` without also
  moving/creating the matching `SKILL.md` fails `validate_manifest()`'s live-vs-declared
  path check — the two must change together.
- Deleting a skill means removing it from *every* manifest surface in one commit:
  `skills[]`, its `categories[category]` list, its
  `subcategories[category][subcategory]` list, any `bundles[]` it appears in, and any
  `relationship_groups[].members` it appears in — a partial removal fails
  `validate_manifest()` with a set-difference error.
- `validate_links()` is opt-in (`--strict-links`) and is not part of the default CI
  invocation — a dangling relative link inside a `SKILL.md` will not fail CI today.
