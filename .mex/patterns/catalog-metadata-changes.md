---
name: catalog-metadata-changes
description: Adding a new skill to the catalog, or editing an existing skill's category/subcategory/bundle/relationship metadata, without breaking the manifest ↔ TOON ↔ README ↔ frontmatter projection contract.
triggers:
  - "add a skill"
  - "new skill"
  - "add to catalog"
  - "update skills.json"
  - "change category"
  - "add to bundle"
edges:
  - target: "context/catalog-pipeline.md"
    condition: "before starting either task — read the validation stage order once"
  - target: "context/conventions.md"
    condition: "for the naming/structure rules this pattern's steps assume"
  - target: "patterns/debug-catalog-ci-failures.md"
    condition: "when the Verify step at the end of either task fails"
grounds_to:
  - node: "function:39bf96d64d80b27fa57ef4bb8138a7d9"
    fingerprint: "mh:64:7b226d696e68617368223a5b31383134343139392c313134333135323739362c3836333436343639302c3234333834363135342c313330313436373933352c323431313835323434332c3135313431343531372c3536333530333831372c313431393035343033302c313430343338393131352c3135303738303934362c3132353037333139332c3935383231393537352c3434343834313132332c3735393330393530302c32373732313037342c3737363234303335342c3832373734363539372c3135303733353532342c31363538383035392c3338303134343636332c323032363037353137312c3331333536323535312c313434303332363937382c3239333632393835382c3731333331303832372c3334383434343538322c3231333137393432312c3430313436353230392c3337353531393738352c3631323437303432302c3538353336313531342c3435333330333332342c3534313139313834392c38383736343531392c3531373337383830322c3539333438303139312c31303836393338392c3539363233303931302c3737393034383135362c3534333038363534362c313036333233303230332c3435353336313934352c3437303938363532372c313030393030373336302c3132393138363339382c3339383634353135382c3435343439313636392c3431333033353737322c3132303632313938342c3638393733383734312c3331373831383530332c313735383835303631312c3631353736383632312c3632393534373037382c3639393438333633352c3133363036323735352c3638333539333932392c3535303538333235322c3932333131303830392c313736383933333631382c313231393135343139352c3133303139353939332c31313732363932355d2c226e65696768626f7273223a5b5d2c22746f6b656e436f756e74223a397d"
  - node: "function:d1051005f6e64620c707377e84b51b8f"
    fingerprint: "mh:64:7b226d696e68617368223a5b32313931393135382c35353539363432352c3137383335323231362c33343939333831332c37363437343538322c37363839323333362c34313538393639392c35353836353739332c32353331383030302c35313039363337352c31373931303839362c31313236353438362c31373431353239352c31383537323237312c3330343437363738372c31333333333631352c31313638323639382c31383232353833342c33373437353736332c38303934333634362c34333639363737332c3133373737373232352c31373338313333312c3133343232353733372c37333232373136312c34393338373230332c37333338383139372c36323732363830362c3132393938373839302c34333636393037392c33313736313835342c3134363731353938312c343431393134332c3132323233303432312c353936373833322c33393634333139352c32303032303034382c36303238383134312c35363936323936392c353731383634332c38363738363235392c3338303937373031332c3832363536312c3433343238333133372c35353932313530382c31353737343834342c35383039323536372c3132333334313832322c3135303730303839302c32323934333537332c38333437373639342c37333535363435332c31383737353335302c3135363131323331372c38353336313636392c37303230383532362c35343139343937332c33333333373335302c3136353932373237392c37333335383338332c36363734323032382c3232343633363333332c32333032383630312c31313732363932355d2c226e65696768626f7273223a5b2266756e6374696f6e3a3164376539623533656437393663343832386436613739306534336365633161222c2266756e6374696f6e3a3339626639366436346438306232376661353765663462623831333861376439225d2c22746f6b656e436f756e74223a3131347d"
last_updated: 2026-09-19
---

# Catalog Metadata Changes

## Context
`.agent-skills/skills.json` is the single manifest for all catalog taxonomy — a skill's
own `SKILL.md` frontmatter never carries category/subcategory/tags/bundle/relationship
data. Every change described here is validated end-to-end by
[`validate_manifest()`](mex://function:39bf96d64d80b27fa57ef4bb8138a7d9), which checks
name/path uniqueness, category/subcategory coverage, bundle/retirement/relationship
reference integrity, and — via
[`safe_manifest_path()`](mex://function:d1051005f6e64620c707377e84b51b8f) — that every
declared `path` is exactly `<name>/SKILL.md` inside a folder named `name`. Read
`context/catalog-pipeline.md` first if you haven't already this session.

## Task: Add a new skill

### Steps
1. Create `.agent-skills/<name>/SKILL.md` with YAML frontmatter (`name`, `description`,
   `allowed-tools`, optional `metadata`) — follow an existing SKILL.md in the same
   category as a template for tone/structure.
2. Add one entry to `.agent-skills/skills.json`'s `skills[]` array: `name`, `category`,
   `subcategory`, `interface`, `path` (`"<name>/SKILL.md"`), `description`, `tags`,
   `version`. `path`, `name`, and the folder name must match exactly.
3. Add `name` to `categories[category]` and to
   `subcategories[category][subcategory]` (create the subcategory list if it's new —
   but only within one of the ten existing top-level categories in `taxonomy`; adding an
   eleventh category is a bigger change most tasks don't need).
4. Bump `skill_count` in `skills.json` by 1.
5. Optional: add `name` to one `bundles[]` list if it belongs in a curated bundle, or to
   a `relationship_groups[].members` list if it overlaps/sequences with an existing
   skill (see `related_groups` mode: `adjacent` vs `layered`).
6. Run `python3 scripts/generate-catalog-projections.py` — it rewrites `skills.toon` and
   the three README skills-list sections (heading counts, subcategory line, table rows,
   intro count) from the manifest and leaves every other byte alone.
7. Run `python3 scripts/validate-catalog-projections.py` locally before opening a PR —
   it will name the exact missing/extra entries via its internal set-difference
   reporting if any of the above is incomplete.

### Gotchas
- `skill_count` is checked literally against `len(skills)` — forgetting to bump it fails
  validation even if everything else is correct.
- A skill must appear in exactly one category and one subcategory — appearing in two,
  or in a subcategory not declared for that category, both fail
  `validate_manifest()`.
- README.md / README.ko.md / README.es-ES.md category tables are validated separately
  and regenerated by the generator; never hand-edit the rows. What the generator does
  **not** touch and you must update by hand: the `Skills-N` badge, the bold headline,
  the "router first, not all N skill folders" note, and the `.agent-skills/ ← N skill
  folders` tree line (all three READMEs), plus `CLAUDE.md`/`AGENTS.md` "catalog of N".
- `.agent-skills/skills.toon` is a projection: run the generator, never hand-edit. The
  toon `|` delimiter has no escaping, so the generator writes ` / ` for a literal `|`
  in a description; keep `|` out of new descriptions anyway.
- `generate-catalog-projections.py --check` exits non-zero if any projection would
  change — use it as the proof that the manifest and projections agree.
- Row order in every README table is `manifest.categories[category]` order and the
  subcategory line is `manifest.subcategories[category]` dict order. Append new names;
  never re-sort existing lists — the 2026-09-18 family import initially
  re-sorted `cli-tools/ai-cli` by accident and had to restore the original order.

### Verify
- [ ] `python3 scripts/generate-catalog-projections.py --check` passes
- [ ] `python3 scripts/validate-catalog-projections.py` passes
- [ ] `python3 scripts/repair-skill-frontmatter.py --check` passes (new SKILL.md
      frontmatter is a real YAML block scalar, not a stray `>-`)
- [ ] `python3 flatten_skills.py --dry-run` reports no pending moves
- [ ] New skill's `path` in skills.json is exactly `<name>/SKILL.md`

## Task: Import an upstream family

Used for mattpocock/skills (2026-09-11) and the pm-skills / langchain-skills /
higgsfield-ai / k-skill / oh-my-gods families (2026-09-18).

### Steps
1. Establish provenance first: shallow-clone the upstream at a pinned commit, confirm the
   license (a `LICENSE` file, or `.claude-plugin/plugin.json` `"license"` when there is
   none), and diff the candidate local copies against upstream. Import upstream content
   at the pin, not the local copies — local copies pick up `.skill_id` markers and
   user-local edits (k-skill's `rhwp-edit` had a paragraph routing to a skill that
   exists nowhere in this catalog).
2. Exclude anything that already exists under `retired_skills`, was deleted from
   `.agent-skills/` in git history on purpose (`git log --diff-filter=D --name-only --
   '.agent-skills/*/SKILL.md'`), or has no verifiable upstream.
3. Copy folders with `shutil.copytree(..., ignore=<.skill_id,.git,__pycache__,.DS_Store>)`.
   Do not rewrite upstream frontmatter unless the validator rejects it (name must equal the
   folder, description 25–1024 chars, no stray `>`/`|` scalar, no `...` truncation).
4. Build manifest entries with the full key set the existing entries use (`name`,
   `description` collapsed to one line, `category`, `subcategory`, `interface`, `path`,
   `tags`, `platforms`, `allowed_tools`, `keyword`, `version`, `source`). Append to
   `skills[]`, `categories[cat]`, `subcategories[cat][sub]`, bump `skill_count`; add new
   subcategories to `taxonomy` too (not validated, but the README subcategory line and
   `jeo-skill categories` read it).
5. Record the family as a `relationship_groups` entry whose `note` carries the upstream
   repo and pinned commit, and add a README "📎 References" row (all three READMEs).
6. Add an on-demand section to `setup-all-skills-prompt.md` stating what blanket setup must
   **not** run (marketplace installers, paid CLIs, credential files) and the exact
   read-only commands that are safe.
7. Add a dated entry to `changelog/{en,ko}/YYYY-MM.md`, then `python3
   scripts/changelog.py sync && python3 scripts/changelog.py check`.

### Gotchas
- `changelog.py sync` drops any README "What's New" block that is not in a monthly file —
  migrate README-only blocks into `changelog/` first (this happened with the 2026-08-09
  entry).
- Serialize `skills.json` with `json.dumps(..., ensure_ascii=False, indent=2) + "\n"` and
  prove the original round-trips byte-for-byte before writing, or the diff will be the
  whole file.
- The user's global skill set is a superset drawn from several of their repos; "missing
  from the catalog" is not the same as "should be imported". Bucket candidates first:
  deliberately removed, runtime/platform command shims, sub-skills already covered by an
  in-catalog router, and unattributed singles.

### Verify
- [ ] Every imported `source` URL resolves and the pinned commit is named in the
      relationship-group note
- [ ] `validate-catalog-projections.py --strict-links` reports no dangling link inside an
      imported folder (pre-existing ones elsewhere are not yours)
- [ ] `jeo-skill related <router>` lists the family and `jeo-skill install --bundle
      <new-bundle> --dry-run` resolves

## Task: Merge a duplicate skill

Used 2026-09-19 for nine pairs (aliases, oh-my-gods wrappers, pm-skills templates).

### Steps
1. Prove the duplicate: same job-to-be-done, not merely adjacent. Explicit markers
   (`Compatibility alias for`, `Use the X skill instead`) are certain; TF-IDF over
   description+body only finds same-vocabulary families, so finish with a manual pass over
   name+description grouped by subcategory. Upstream sibling splits inside a vendored family
   and provider choices (`aura` / `unsplash`, `langsmith` / `opik`) are **not** duplicates —
   declare a `relationship_groups` entry (`adjacent` or `layered`) instead.
2. Pick the canonical: the routing-first skill with the broader description and references,
   or the official upstream over a wrapper.
3. Absorb, do not delete: move the duplicate's unique content into the canonical's
   `references/` (a new file or a marked section), link it from `SKILL.md`, and add the
   duplicate's trigger phrases plus "owns the retired `<name>` name" to the canonical
   description (≤1024 chars). In a vendored upstream folder, mark additions with a
   `<!-- jeo-skills catalog addition (not upstream) -->` comment and prefer a new
   `references/` file over editing upstream prose.
4. `shutil.rmtree` the duplicate; remove it from `skills[]`, `categories`,
   `subcategories`, `bundles`, and every `relationship_groups[].members` (drop a group that
   falls under two members); add `retired_skills[<name>] = {replacement, replacement_type:
   "skill", reason}`; bump `skill_count`.
5. Grep the whole catalog + setup prompt + READMEs for the retired name and repoint every
   route-out (`use \`<old>\`` → canonical). Package names (`deepagents` on PyPI), BMAD
   artifact names (`sprint-plan`), and mode names (`release-notes`) are not references.
6. Sync manifest descriptions from the edited SKILL.md files (the validator compares them
   whitespace-insensitively), run the generator, then the full gate set, then
   `jeo-skill install <old-name> --dry-run` must print `retired: old->new`.

### Gotchas
- `retired_skills` entries with `replacement_type: "workflow"` (e.g. `clawteam`) point at a
  non-skill; only `"skill"` replacements must exist in `skills[]`.
- `validate-catalog-projections.py --strict-links` is the only check that catches a
  reference file you forgot to move; run it even though CI does not.
- Restoring a canonical skill's own missing `references/` (video-production lost three in
  `108fbaa` and #376 only restored `SKILL.md`) belongs in the same merge — otherwise the
  merged links dangle too.

## Task: Update an existing skill's metadata

### Steps
1. Decide what's actually changing: `description`/`tags` (low risk), `category`/
   `subcategory` (medium — touches two list memberships), or `path`/`name` (high — must
   be paired with an actual folder rename/move in the same change).
2. For a `category`/`subcategory` move: remove the name from the old
   `categories[old]`/`subcategories[old][old_sub]` lists and add it to the new ones in
   the same edit — a partial move (added to new, not removed from old, or vice versa)
   fails `validate_manifest()`'s duplicate/coverage checks.
3. For a `description` change: keep the manifest's `description` and the SKILL.md
   frontmatter `description` saying the same thing — `validate_skill_documents()`
   cross-checks them.
4. For retiring a skill instead of deleting it outright: move it out of `skills[]` and
   into `retired_skills[name]` with `replacement`, `replacement_type`
   (`"skill"`/`"workflow"`), and `reason` — `resolve_install_selection()` in
   `jeo-skill.py` reads this to print a helpful "retired: X->Y" error instead of a bare
   "unknown skill" when someone tries to install the old name.
5. Run `python3 scripts/validate-catalog-projections.py` before opening a PR.

### Gotchas
- `retired_skills` and live `skills[]` must never overlap the same name —
  `validate_manifest()` rejects that directly.
- Changing `category`/`subcategory` without touching `bundles[]`/
  `relationship_groups[]` is fine — those only reference skill *names*, not categories.

### Verify
- [ ] `python3 scripts/validate-catalog-projections.py` passes
- [ ] If `description` changed: SKILL.md frontmatter and manifest description still
      agree
- [ ] If category/subcategory changed: old membership removed, new membership added,
      in the same commit

## Update Scaffold
- [ ] Update `.mex/ROUTER.md` "Current Project State" if what's working/not built has changed
- [ ] Update `.mex/context/catalog-pipeline.md` if a validation stage's behavior changed
- [ ] If a new recurring catalog-editing gotcha was learned, add it here
