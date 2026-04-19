# Notes and troubleshooting

## Secondary note export
Treat note export as a **secondary follow-up**, not the primary packet.

### Obsidian / Bear export
- Saving reviewed artifacts is optional; review/approval can still happen without it.
- Save reviewed plans or specs when the goal is team reference, auditability, or lightweight archiving.
- If the user needs broader vault taxonomy, wiki curation, or ongoing note automation, route to `obsidian` or `llm-wiki`.

## Current caveats that should stay visible
- Diff review requires a git repo, PR URL, or explicit commit range.
- Markdown/spec review may not have the same approve/request-changes semantics as native plan-review flows on every runtime.
- Codex setup currently has more manual/partial edges than Claude or Gemini in upstream `plannotator` docs.
- OpenCode users may prefer manual review control when auto-invocation is too eager.
- Remote/container/WSL flows often need explicit port and environment setup before the browser UI behaves predictably.

## Useful commands
```bash
# verify installation + integrations
bash scripts/check-status.sh

# review current working tree diff
bash scripts/review.sh

# review a specific commit
bash scripts/review.sh HEAD~1

# configure remote mode / stable port behavior
bash scripts/configure-remote.sh
```

## Troubleshooting ladder
1. **Nothing opens / review fails to launch**
   - run `bash scripts/check-status.sh`
   - confirm the platform-specific integration is actually configured
   - confirm the artifact exists (plan, diff, PR, or markdown file)
2. **The wrong review mode is triggering**
   - confirm whether the runtime is using native hooks or a manual review path
   - if auto-review is too eager, switch to the smallest manual trigger the platform supports
3. **Diff review is failing**
   - confirm you are inside a git repo or have an explicit PR/commit target
   - try a specific commit or diff range instead of an ambiguous working tree
4. **Markdown/spec review is awkward**
   - confirm the artifact path and the platform's current approval limitations
   - be explicit if the workflow is annotation-only rather than true approve/request-changes
5. **Remote session is flaky**
   - run `bash scripts/configure-remote.sh`
   - verify the expected port/environment settings
   - prefer stable ports/URLs when another human or agent must revisit the review session
6. **Notes are not saving**
   - confirm note integration is configured
   - treat note export as secondary to the review flow; if review itself is broken, fix that first

## Decision rule
If troubleshooting turns into platform ownership, environment setup, merge policy, or a wider note-management task, hand off to the specialized neighboring skill instead of stretching `plannotator` further.
