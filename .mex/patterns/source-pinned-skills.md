---
name: source-pinned-skills
description: Package a named upstream operator without overstating offline evidence.
last_updated: 2026-11-13
---

# Source-pinned operator packages

Use when adding a named upstream tool as a catalog skill with references and an offline helper.

1. Read `skill-standardization` and `writing-for-agents`; freeze one full upstream commit and inspect commands, dependencies, licensing and side effects there.
2. Reuse the catalog's portable manifest-driven helper when its selected-file contract fits. For that helper, hash fetched raw bytes but store `files[].url` as `https://github.com/OWNER/REPO/blob/FULLSHA/PATH`; the URL is checked exactly.
3. Test both synthetic unsafe inputs and the actual shipped manifest. Synthetic fixtures alone missed raw-versus-blob URL drift during SkillEvaluator packaging.
4. Run the actual helper against the selected upstream bytes using canonical nonsymlink paths. On macOS, use `/private/tmp` rather than `/tmp`. A selected-file match is not HEAD, scanner, security or runtime verification.
5. Update `skills.json`, regenerate its projections, then run the standards, catalog, frontmatter and flat-layout checks. Keep authored routing scenarios distinct from executed model evaluations.
6. Smoke-install into an isolated HOME and compare every installed support file's bytes. Run the installed helper, not only the source copy.
7. Add the release note only after smoke success, synchronize README windows, review scoped changes and publish without including unrelated worktree changes.

If an edit tool mishandles multi-file tagged sections, stop, re-read the affected files, restore unrelated bytes from a verified baseline and apply one file per call. A successful edit receipt alone did not catch that failure in the 2026-11-13 session.
