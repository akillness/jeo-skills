---
name: debug-catalog-ci-failures
description: Where to look when .github/workflows/ci.yml fails — the most common failure boundary in this project, since almost every change ends up validated by the four CI steps against the manifest/README/TOON/frontmatter projection contract.
triggers:
  - "CI failing"
  - "validate-catalog-projections failed"
  - "catalog projection validation failed"
  - "frontmatter check failed"
  - "flatten_skills dry-run"
edges:
  - target: "context/catalog-pipeline.md"
    condition: "for what each validation stage actually checks, in call order"
  - target: "context/decisions.md"
    condition: "for why CI never runs these scripts in mutating mode"
  - target: "patterns/catalog-metadata-changes.md"
    condition: "when the failure traces back to an incomplete metadata edit"
grounds_to:
  - node: "class:e2af435088952ba65df93472c31a440b"
    fingerprint: "mh:64:7b226d696e68617368223a5b31383134343139392c313134333135323739362c3836333436343639302c3234333834363135342c313330313436373933352c323431313835323434332c3135313431343531372c3536333530333831372c313431393035343033302c313430343338393131352c3135303738303934362c3132353037333139332c3935383231393537352c3434343834313132332c3735393330393530302c32373732313037342c3737363234303335342c3832373734363539372c3135303733353532342c31363538383035392c3338303134343636332c323032363037353137312c3331333536323535312c313434303332363937382c3239333632393835382c3731333331303832372c3334383434343538322c3231333137393432312c3430313436353230392c3337353531393738352c3631323437303432302c3538353336313531342c3435333330333332342c3534313139313834392c38383736343531392c3531373337383830322c3539333438303139312c31303836393338392c3539363233303931302c3737393034383135362c3534333038363534362c313036333233303230332c3435353336313934352c3437303938363532372c313030393030373336302c3132393138363339382c3339383634353135382c3435343439313636392c3431333033353737322c3132303632313938342c3638393733383734312c3331373831383530332c313735383835303631312c3631353736383632312c3632393534373037382c3639393438333633352c3133363036323735352c3638333539333932392c3535303538333235322c3932333131303830392c313736383933333631382c313231393135343139352c3133303139353939332c31313732363932355d2c226e65696768626f7273223a5b5d2c22746f6b656e436f756e74223a397d"
  - node: "function:6ec8fb763db3e36e7ba5ad788883f5a7"
    fingerprint: "mh:64:7b226d696e68617368223a5b3132303239383339392c383937303039362c37333038313935362c313032383037362c3134323734383333322c3839333939373237312c31363936343437372c3130373536393134372c3132323337333731382c313530353036373432362c31373931303839362c333638333134362c31313035343739392c343538393938362c31333130393436382c3437373732323937312c31313136383431392c33303938343430302c3831363338333138392c343534333731392c33383137363739372c3830383431382c3136343232333934332c3133343232353733372c3239373434303930362c38353335393234352c3134333539363134362c313032383739363231382c3336343535373938302c31333039373034392c38353335323039392c3232373732383836342c39323836383239312c333331313938302c3335373635383539312c3131353639383531382c33373535313235363430342c3131313637393531372c3438303138303130382c3431313937363738322c3535393930303836352c3335343534373635332c39303031373634392c3133373239313037332c3439313934313134332c3234353836363231352c3131333438303930332c3331313630383534372c3338383036383234352c313832373139393834332c38333437373639342c3230393530363431302c313435383833383531362c313037353238393236332c3532393336333537332c3230393339383530372c37303230383532362c35343139343937332c33313633313736362c31313732363932355d2c226e65696768626f7273223a5b2266756e6374696f6e3a333930303836323538323430646163326566396635396663333939663764222c2266756e6374696f6e3a366563386662373633646233366533376261356164373838383833663561372c39346464646432646538613536376263396139613530326265626534333030225d2c22746f6b656e436f756e74223a34317d"
last_updated: 2026-08-19
---

# Debug: Catalog CI Failures

## Context
`.github/workflows/ci.yml` runs four steps, in this exact order, on every PR into
`main`:
1. `python3 scripts/validate-catalog-projections.py --self-test-rule-f`
2. `python3 scripts/validate-catalog-projections.py`
3. `python3 scripts/repair-skill-frontmatter.py --check`
4. `python3 flatten_skills.py --dry-run`

All four are read-only by contract — none of them should ever be run without their
non-mutating flag in CI (see `context/decisions.md` for the incident this guards
against: a prior CI config ran two of these scripts in mutating mode, which corrupted
26 SKILL.md descriptions on every PR). Every check raises a Python
[`ValidationError`](mex://class:e2af435088952ba65df93472c31a440b) caught once at
`main()`, so the printed message is almost always specific enough to act on directly —
read it before re-running anything.

## Steps
1. Reproduce locally first, in CI's own step order — don't skip straight to step 4:
   ```bash
   python3 scripts/validate-catalog-projections.py --self-test-rule-f
   python3 scripts/validate-catalog-projections.py
   python3 scripts/repair-skill-frontmatter.py --check
   python3 flatten_skills.py --dry-run
   ```
2. Read the failing step's printed message — `validate-catalog-projections.py` reports
   an explicit set-difference (missing/extra names) via its internal
   `_set_difference_message` helper for most manifest/README/TOON mismatches; act on
   exactly what it names, don't guess.
3. Map the failing step to what changed:
   - Step 1/2 (`validate-catalog-projections.py`) failing → almost always an incomplete
     `.agent-skills/skills.json` edit (see `patterns/catalog-metadata-changes.md`) or a
     SKILL.md moved/renamed without the manifest `path` following it.
   - Step 3 (`repair-skill-frontmatter.py --check`) failing → a SKILL.md's YAML
     frontmatter is not valid/parseable — often a `description: >-` block edited by
     hand or by a naive script that broke the folded-scalar indentation.
   - Step 4 (`flatten_skills.py --dry-run`) failing → a skill folder was created nested
     under something other than `.agent-skills/<name>/` directly.
4. Fix at the source, don't patch the projection: edit `skills.json` or the SKILL.md
   itself, never hand-edit `skills.toon` or README tables to "make CI pass" — they are
   generated/validated *from* the manifest and will just re-diverge.
5. For a frontmatter break specifically: run
   `python3 scripts/repair-skill-frontmatter.py` **without** `--check` locally to
   actually recover it — [`repair_document()`](mex://function:6ec8fb763db3e36e7ba5ad788883f5a7)
   pulls a known-good description from `skills.toon`/manifest/setup-prompt sources and
   rewrites only the broken entry, leaving already-healthy documents byte-identical —
   then re-run `--check` to confirm.

## Gotchas
- Never "fix" a CI failure by running `repair-skill-frontmatter.py` or
  `flatten_skills.py` in mutating mode as part of CI itself, or by committing their
  output without reviewing the diff — that is exactly the failure mode
  `context/decisions.md` documents.
- `validate_links()` (dangling relative link check) is **not** part of the default CI
  invocation (`--strict-links` is not passed) — don't assume a broken markdown link will
  be caught by CI today.
- The Rule F self-test (`--self-test-rule-f`) exercises the exception-ledger mechanism
  itself, not your actual manifest — if it fails, the problem is in
  `scripts/build_exception_ledger.py` / the ledger file's structure, not in your skill
  edit.

## Verify
- [ ] All four CI steps pass locally, in order
- [ ] The fix touched `skills.json` and/or the affected `SKILL.md` — not
      `skills.toon` or README.md directly
- [ ] `git diff` on any file touched by a repair script is reviewed before committing

## Update Scaffold
- [ ] Update `.mex/context/catalog-pipeline.md` if a validation stage's actual behavior
      turned out to differ from what's documented there
- [ ] If this is a new recurring failure shape, add it to the Steps mapping above
