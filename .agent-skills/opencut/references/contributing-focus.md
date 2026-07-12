# OpenCut Contributing — Current Focus (Classic Repo)

Source: `opencut-app/opencut-classic`'s `.github/CONTRIBUTING.md` and `README.md`.
Re-fetch before quoting — this changes as the refactor progresses (see
`scripts/fetch-docs.sh classic`).

## PR policy

⚠️ Feature PRs are **not currently being accepted** while the core editor is
built out. Process for anything beyond a small fix:
1. Open an issue first to discuss.
2. Wait for maintainer approval.
3. Only then start coding.

Critical bug fixes may be accepted case-by-case without pre-approval, but
still expect review friction — check open issues/Discord first.

## 🎯 Good areas to contribute

- Timeline functionality and UI improvements
- Project management features
- Performance optimizations
- Bug fixes in existing functionality
- UI/UX improvements
- Documentation and testing

## ⚠️ Areas to avoid right now

- Preview panel enhancements (text fonts, stickers, effects)
- Export functionality improvements
- Preview rendering optimizations

**Why:** the preview system is being rewritten from a DOM/HTML-based prototype
to a binary rendering approach (similar to CapCut) so preview and export stay
consistent and perform better. Work in the current HTML-based preview is
likely to be thrown away.

If unsure whether a change falls into the preview category, tell the user to
ask in Discord (https://discord.gg/zmR9N35cjK) or open a GitHub issue before
investing effort.

## PR checklist to give the user

1. Fork the repo and clone locally.
2. Follow `references/classic-setup.md` for environment setup.
3. Confirm the change is in a "good area" above, or that an issue/maintainer
   already approved it.
4. Create a feature branch; keep the diff scoped to the discussed change.
5. If touching `apps/desktop`, also read `apps/desktop/README.md`.
6. Open the PR referencing the discussed issue.

## Rewrite repo (`OpenCut-app/OpenCut`)

Not accepting outside contributions at all yet — the architecture (Editor
API, plugin system, Rust core) is still being designed. Direct interested
contributors to the Discord or to opening an issue to follow along, not to a
PR.
