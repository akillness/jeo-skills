# Installation and Lifecycle

## Safe default

Install a named subset from a reviewed checkout. Do not install from moving
`main`, do not copy only `SKILL.md`, and do not use a full bundle to avoid making
a routing decision.

The audited pin is:

```text
release: v2.65.0
commit: f6fcafeb1cc8c82eca0160a18bc41c38427b8e0f
```

A newer release may be used only after the same inventory, license, collision,
and risk checks are repeated.

## 1. Stage a pinned checkout

```bash
git clone --filter=blob:none \
  https://github.com/K-Dense-AI/scientific-agent-skills.git \
  /path/to/scientific-agent-skills
git -C /path/to/scientific-agent-skills checkout \
  f6fcafeb1cc8c82eca0160a18bc41c38427b8e0f
git -C /path/to/scientific-agent-skills status --short
git -C /path/to/scientific-agent-skills rev-parse HEAD
```

The checkout should be detached or otherwise protected from an accidental
pull. Do not run repository setup, package installation, tests, or upstream
scripts merely to inspect the skill documents.

## 2. Audit before selection

```bash
python3 .agent-skills/scientific-agent-skills/scripts/audit-pack.py doctor \
  --repo /path/to/scientific-agent-skills \
  --expect-commit f6fcafeb1cc8c82eca0160a18bc41c38427b8e0f \
  --format json

python3 .agent-skills/scientific-agent-skills/scripts/audit-pack.py inventory \
  --repo /path/to/scientific-agent-skills \
  --format json
```

`BLOCKED` means the repository path, origin, commit, license marker, symlink
boundary, or inventory contract is unsafe or unavailable. `WARN` means the
source can be inspected, but specific frontmatter or catalog drift needs human
review. At the audited pin, the helper deliberately reports `WARN` because the
163-folder tree includes `waypoint-bio` while `docs/skills.md` lists only 162
skills. Risk counts are string-matching leads, not verdicts.

## 3. Select by intent

Use `catalog-and-routing.md`, then inspect the complete selected folder.
Selection should state:

- input data and format;
- intended scientific method or package;
- output artifact;
- local, API, cloud, scheduler, or hardware execution surface;
- required credentials and network destinations;
- package, interpreter, system, GPU, and license constraints;
- why nearby local skills are not the better owner.

Do not select the upstream `docx`, `pdf`, `pptx`, or `xlsx` folders. Their
bundled terms block copying and derivatives outside the covered services.

## 4. Preview inventory and destination

The Agent Skills CLI can inspect a local checkout without installing:

```bash
npx --yes skills@1.5.23 add /path/to/scientific-agent-skills \
  --list --full-depth
```

Then run the deterministic plan:

```bash
python3 .agent-skills/scientific-agent-skills/scripts/audit-pack.py plan \
  --repo /path/to/scientific-agent-skills \
  --target /path/to/agent/skills \
  --skill scanpy \
  --skill anndata \
  --format json
```

The plan is read-only. It blocks:

- no selection;
- unknown skill names;
- invalid selected frontmatter;
- existing target paths or symlinks;
- the restricted document folders;
- a source audit that is already `BLOCKED`.

A collision is a decision, not a `--force` suggestion. Compare the existing
and upstream owners, then choose an isolated target, keep the current owner, or
prepare an explicit replacement with backup and rollback.

## 5. Install the reviewed subset

Example after review:

```bash
npx --yes skills@1.5.23 add /path/to/scientific-agent-skills \
  --skill scanpy anndata \
  --global --agent universal --yes --copy --full-depth
```

Before running it, restate:

1. source path and commit;
2. selected names;
3. target and host agent;
4. selected license terms;
5. collision result;
6. copy versus link behavior;
7. paths expected to change;
8. rollback or backup path.

Installation approval covers only instruction files. It does not approve the
commands inside them.

The upstream README also documents a GitHub CLI skill extension:

```bash
gh skill install K-Dense-AI/scientific-agent-skills scanpy --pin v2.65.0
```

Do not assume `gh skill` exists. Check `gh skill install --help`, current pin
support, destination behavior, and collision behavior first.

## 6. Verify installation

For each selected skill:

```text
[ ] target/<name>/SKILL.md exists and is non-empty
[ ] frontmatter name equals <name>
[ ] every expected reference/script/asset is present
[ ] relative links resolve inside the selected folder
[ ] bytes match the reviewed checkout
[ ] source commit and license are recorded
[ ] no unrelated destination changed
[ ] one representative prompt routes to the intended owner
```

Do not report the package, API, model, database, cloud job, or scientific result
as working until that separate runtime path is tested.

## 7. Operate with a second gate

Before executing an installed skill, inspect its complete instructions and
support code. Freeze:

- working directory and input paths;
- sensitive-data classification;
- environment and dependency changes;
- credential names and endpoints;
- API, cloud, model, or hardware cost;
- output and overwrite paths;
- time limit and cancellation path;
- scientific controls and validation criteria;
- external visibility or publication consequence.

Use dry runs, simulations, small public fixtures, and reviewable outputs before
real data or hardware.

## 8. Refresh safely

1. Fetch tags without changing the installed selection.
2. choose an explicit candidate tag or SHA;
3. stage it in a separate checkout;
4. rerun the audit;
5. compare only the installed folders plus their licenses;
6. review trigger wording, dependencies, scripts, endpoints, and data handling;
7. re-run destination planning;
8. back up the current selection;
9. replace only the approved names;
10. verify bytes and representative routing;
11. keep the old pin until rollback is no longer needed.

Never refresh from `main` in place. A new repository version does not imply that
every sub-skill changed or remains compatible.

## 9. Remove or roll back

Removal is destructive. Confirm the exact target paths and ensure no target is
a shared symlink or locally modified skill. Prefer restoring the recorded prior
copy. After removal or rollback, verify that unrelated skills and discovery
indexes still exist and that the intended prior owner is selected.
