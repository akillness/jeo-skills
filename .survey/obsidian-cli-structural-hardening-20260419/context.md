# Context: obsidian-cli structural hardening

## Workflow Context
`obsidian-cli` sits between several different automation surfaces that users often blur together:

1. **Official desktop CLI** for one-shot commands, TUI use, plugin/theme development, screenshots, and command execution against a running Obsidian app.
2. **Official `obsidian://` URIs** for launcher, shortcut, browser, and callback-style handoff workflows.
3. **Plugin-powered URI/API extensions** such as Advanced URI or Local REST API when users need richer write semantics, workspace switching, frontmatter edits, or structured external control.
4. **Headless/sync workflows** that should route away from the desktop CLI entirely.

Across developer workflow, web/fullstack note automation, PM/ops coordination, marketing/content capture, and game-dev production notes, the recurring question is less “how do I use Obsidian?” and more “which automation surface fits this job without brittle workarounds?”

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Plugin/theme developer | Reload plugins, inspect UI, capture screenshots, run app-side commands | Intermediate to advanced |
| Agent or automation author | Drive desktop note actions, search/read/create content, hand off via callbacks | Intermediate |
| PM / ops user | Daily notes, reviews, task capture, workspace-specific note contexts | Beginner to intermediate |
| Marketing / content operator | Quick note creation, export-triggering, reusable capture flows | Beginner to intermediate |
| Game-dev production user | Structured production notes, workspace switching, metadata-heavy note ops | Intermediate |
| Headless/server operator | Wants sync or unattended note handling without a GUI | Intermediate to advanced |

## Current Workarounds
1. Use **Advanced URI** when official URI or CLI coverage is too narrow for workspace loading, command invocation, search/replace, or frontmatter operations.
2. Use plugin-command indirection: bind custom plugin actions inside Obsidian, then trigger them externally via URI or command IDs.
3. Prefer URI launchers for simple open/new/daily/search flows instead of CLI orchestration when the real need is desktop handoff.
4. Fall back to direct filesystem writes when the job is really “append markdown to a vault” rather than “control the running app.”
5. Route shell-native or cron-friendly note workflows to adjacent tools like **Joplin Terminal** or **nb** when desktop coupling is unacceptable.

## Adjacent Problems
- Desktop-only assumptions break CI/server/headless expectations.
- Vault/file defaults (`active vault`, `active file`, `file=` resolution) are convenient for humans but risky for agents.
- Plugin prerequisites (`Daily notes`, `Unique note creator`) create silent semantic failures.
- URI encoding, pane targeting, and callback support are easy to get wrong.
- Linux/macOS registration guidance drifts as official installer behavior changes.
- Users often ask for richer external automation than first-party CLI/URI currently provide.

## User Voices
> “It would be useful to start in the perfect layout directly rather than changing the workspace manually.”  
— Obsidian Forum, Load workspace per URL scheme  
https://forum.obsidian.md/t/load-workspace-per-url-scheme/7120

> “Open a ‘To-Do’ workspace through the URI when you’re working on tasks… Trigger the workspace for a weekly review through a link in a task…”  
— Obsidian Forum reply, Load workspace per URL scheme  
https://forum.obsidian.md/t/load-workspace-per-url-scheme/7120

> “In combination with a shortcut, this creates a Drafts-like ‘just start writing’ button for your Obsidian Daily Notes.”  
— Obsidian Forum, Journal/Log workflow  
https://forum.obsidian.md/t/journal-log-workflow-drafts-like-just-start-writing-for-your-daily-notes-ios/18382

> “Can I add additional arguments to this uri, so I won’t have to press button manually?”  
— Advanced URI issue #174  
https://github.com/Vinzent03/obsidian-advanced-uri/issues/174

> “I currently create a templater script, bind it to a command, and then trigger it from outside Obsidian via the Advanced URI plugin.”  
— Advanced URI issue #114  
https://github.com/Vinzent03/obsidian-advanced-uri/issues/114

> “I’m starting to build a number of automations that leverage obsidian-advanced-uri… some external to obsidian, and some internal from buttons in dataview output.”  
— Advanced URI issue #77  
https://github.com/Vinzent03/obsidian-advanced-uri/issues/77

## Sources
- Official Obsidian CLI docs: https://help.obsidian.md/Extending%20Obsidian/Obsidian%20CLI
- Official Obsidian URI docs: https://help.obsidian.md/Extending%20Obsidian/Obsidian%20URI
- Official Obsidian Headless docs: https://help.obsidian.md/Extending%20Obsidian/Obsidian%20Headless
- Advanced URI docs: https://publish.obsidian.md/advanced-uri-doc/
- Advanced URI repo: https://github.com/Vinzent03/obsidian-advanced-uri
- Obsidian Forum workspace request: https://forum.obsidian.md/t/load-workspace-per-url-scheme/7120
- Obsidian Forum daily-note shortcut workflow: https://forum.obsidian.md/t/journal-log-workflow-drafts-like-just-start-writing-for-your-daily-notes-ios/18382
