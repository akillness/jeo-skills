# Intake Packets and Route-outs

Use this reference when `obsidian-cli` needs to choose the smallest truthful automation surface instead of dumping every command family.

## 1. Pick one primary surface

| Situation | Primary surface | Best packet |
|---|---|---|
| Need terminal-readable output from a running desktop app | `cli-command` | one-shot command packet with explicit vault/path targeting |
| Need interactive exploration or autocomplete/history | `cli-tui` | short TUI packet |
| Need plugin/theme reloads, screenshots, app-state inspection, or command-palette execution | `cli-developer` | developer packet with stateful-command warning |
| Need handoff from shortcuts, launchers, browsers, or another app | `uri-handoff` | URI packet with encoding + callback notes |
| Need sync/publish without the desktop app | `headless-route-out` | route to Obsidian Headless |
| Need simple markdown writes to a vault path | `filesystem-route-out` | direct file-write route-out |
| Need richer external CRUD/frontmatter/workspace automation | `plugin-api-route-out` | route to Local REST API / Advanced URI style workflow |

## 2. Quick route-selection checks
- Is a running desktop Obsidian app actually available?
- Does the task need terminal output, or just app launch/handoff?
- Does the task depend on plugin prerequisites like Daily notes or Unique note creator?
- Would `file=` ambiguity make `path=` the safer target?
- Is the user really asking for a headless service workflow rather than desktop control?
- Does the request need richer external automation than first-party CLI/URI expose?

## 3. Safe defaults for agent runs
- Prefer `vault=` whenever more than one vault could match.
- Prefer exact `path=` over `file=` for deterministic note targeting.
- Prefer one-shot commands over the TUI unless the user explicitly wants interactive exploration.
- Prefer URI handoff for callback-style launchers instead of building shell glue around app-opening commands.
- Prefer route-outs over fake coverage when the task changed.

## 4. Typical route-outs
- **Obsidian Headless** — Sync/Publish without the desktop app.
- **Direct filesystem write** — append or create markdown in a vault path when app-state semantics are unnecessary.
- **Plugin/API workflows** — Local REST API or Advanced URI when the user needs richer control such as frontmatter edits, workspace automation, or more capable external CRUD.
- **Adjacent note CLIs** — Joplin Terminal, `nb`, or `zk` when the real need is shell-native notes independent of Obsidian.

## 5. Failure language to preserve truthfulness
Good phrases:
- "This is a desktop Obsidian control task, so the official CLI fits."
- "This is really a callback/launcher workflow, so an `obsidian://` URI is the cleaner surface."
- "This sounds like headless sync rather than desktop control, so route to Obsidian Headless."
- "This needs richer external automation than first-party CLI/URI expose; use a plugin/API route instead of forcing the official CLI."

Avoid:
- "Obsidian CLI should handle all note automation."
- "Just use the TUI" when the real need is URI handoff or headless sync.
- "It should work in CI" unless desktop access is actually present.
