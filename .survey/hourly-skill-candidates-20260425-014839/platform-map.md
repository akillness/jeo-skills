## Settings
- Prefer `gh search repos` JSON schema with explicit fields.

## Rules
- Run 5 required keyword families each loop.
- Enforce metadata minimum per kept candidate.

## Hooks
- Validate artifact contract after writing files.

## Platform Gaps
- Web search transport/auth instability; GitHub-native fallback is more robust in cron contexts.
