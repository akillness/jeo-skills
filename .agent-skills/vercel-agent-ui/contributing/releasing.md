# Releasing

The six `@ui-sdk/*` packages go to npm together, always at the same version. `@ui-sdk/react@0.3.0` goes with `@ui-sdk/core@0.3.0`, so nobody has to work out which versions match.

## Add a changeset

A pull request that changes what users get adds a changeset:

```bash
pnpm changeset
```

Pick the packages it touches, the bump (patch, minor or major) and write one line for the changelog. It lands as a Markdown file in `.changeset/`. Docs, tests and tooling need none.

## Release

`.github/workflows/release.yml` runs on every push to main:

1. With changesets on main, it opens or updates the **chore: version packages** pull request. It bumps every package to the new version, writes each `CHANGELOG.md` and removes the changesets.
2. Merging that pull request runs the full suite on the merge commit, then publishes the new version to npm with provenance, tags it and creates a GitHub release.
3. With nothing to version or publish, it does nothing.

Publishing uses npm trusted publishing, so there's no npm token in the repo.

## First release

npm sets up a trusted publisher only for a package that exists, so the first version goes out by hand:

1. In the repo's settings, under Actions, General, allow GitHub Actions to create pull requests.
2. Add a changeset and merge the version pull request. Publishing stays off until the `NPM_PUBLISH` repository variable is `true`, so the merge publishes nothing.
3. Run the CI workflow on main with the `full` suite (Actions, CI, Run workflow), and wait for it to pass.
4. From that commit of main, signed in to npm with publish rights on `@ui-sdk`:

   ```bash
   pnpm install && pnpm build && pnpm docs:packages && pnpm check:packages && pnpm changeset publish && git push --follow-tags
   ```

5. On npmjs.com, add a trusted publisher to each of the six packages: GitHub Actions, repository `vercel-labs/ui`, workflow `release.yml`.
6. In the repo's settings, set the Actions variable `NPM_PUBLISH` to `true`.

From then on, merging a version pull request is the whole release.
