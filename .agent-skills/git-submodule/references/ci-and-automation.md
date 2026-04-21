# CI and Automation Notes for Git Submodules

## GitHub Actions checkout
`actions/checkout` does **not** fetch submodules unless you ask it to.

### Public or same-credential submodules
```yaml
- uses: actions/checkout@v5
  with:
    submodules: recursive
```

### Private submodules
You may need SSH or a token with access to every referenced repo.
```yaml
- uses: actions/checkout@v5
  with:
    submodules: recursive
    ssh-key: ${{ secrets.DEPLOY_KEY }}
```

## Automation rules
- If CI only needs the pinned contents, use recursive checkout and stop there.
- If CI is supposed to **advance** a submodule pointer, make the branch intent explicit and commit the resulting pointer change in the superproject.
- Treat private-submodule auth as part of the main workflow, not an afterthought.

## Bootstrap scripts
For repo bootstrap scripts or Makefiles, prefer one obvious command:
```bash
git submodule update --init --recursive
```
If the repo depends on this, document it in setup/onboarding rather than assuming contributors will remember.

## Failure pattern checklist
- Missing files after clone → submodules were never initialized.
- CI works locally but not remotely → workflow checkout is missing `submodules:` or credentials.
- Submodule is on detached `HEAD` after automation → expected when syncing to the pinned commit; only switch branches if you intend to edit inside it.
