# Notes and troubleshooting

## Notes export
Use note export only after confirming the review flow itself works.

### Obsidian / Bear export
- Obsidian/Bear saving is optional; review/approval can still happen without it.
- Save reviewed plans when the goal is team reference, future retrieval, or lightweight archiving.
- If the user needs a broader note taxonomy, vault automation, or wiki curation workflow, route to `obsidian` or `llm-wiki`.

## Known caveats
- Diff review requires a git repo or commit range.
- Manual review mode may not push feedback directly into the active agent session the same way a hook-driven plan-review flow does.
- Note export depends on the mode/environment being configured correctly; verify before treating note save as a guaranteed output.
- Remote/container/WSL flows often need explicit port and environment setup before the browser UI behaves predictably.

## Useful commands
```bash
# verify installation + integrations
bash scripts/check-status.sh

# review current working tree diff
bash scripts/review.sh

# review a specific commit
bash scripts/review.sh HEAD~1

# configure remote mode
bash scripts/configure-remote.sh
```

## Troubleshooting ladder
1. **Nothing opens / review fails to launch**
   - run `bash scripts/check-status.sh`
   - confirm the platform-specific integration is actually configured
   - confirm the artifact exists (plan, diff, or file to annotate)
2. **Diff review is failing**
   - confirm you are inside a git repo
   - try a specific commit or diff range instead of an ambiguous state
3. **Remote session is flaky**
   - run `bash scripts/configure-remote.sh`
   - verify the expected port/environment settings
4. **Notes are not saving**
   - confirm note integration is configured
   - treat note export as secondary to the review flow; if review itself is broken, fix that first

## Decision rule
If troubleshooting turns into platform orchestration, environment setup, or a wider note-management task, hand off to the specialized neighboring skill instead of stretching `plannotator` further.
