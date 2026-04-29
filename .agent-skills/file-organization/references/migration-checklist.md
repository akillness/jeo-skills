# Migration Checklist

Use this before moving files or renaming folders in a live repo.

## 1. Audit current hotspots
- List the folders that cause the most cross-cutting edits.
- Note any framework-reserved files or directories.
- Find barrel files, import aliases, and deep imports that will break.

## 2. Define the target boundary model
- One sentence per top-level directory/package explaining what belongs there.
- Shared-vs-feature promotion rule.
- Naming convention and public-API/import rule.

## 3. Pick a migration shape
- **Incremental feature-by-feature move** for active repos.
- **Compatibility shim phase** if aliases/barrels must keep old imports alive temporarily.
- **Big-bang move** only when the repo is small or frozen.

## 4. Stage the change
1. Create target folders/packages and docs.
2. Move one feature or one boundary class at a time.
3. Update imports/aliases and remove dead compatibility helpers.
4. Run tests/build/lint after each stage.
5. Update onboarding docs and examples.

## 5. Verify
- Build/test/lint pass.
- Search for stale imports or dead path aliases.
- Confirm no new junk-drawer folders were created during the move.
- Make sure route files, scripts, docs, and generated files still live where tools expect them.

## 6. Rollback / pause plan
- Keep move batches small enough to revert.
- Avoid half-moving one feature across two architectures for long.
- If the team cannot finish the migration now, choose a stable intermediate structure and document it.
