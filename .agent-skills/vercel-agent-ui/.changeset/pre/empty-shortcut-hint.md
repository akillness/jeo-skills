---
"@ui-sdk/core": patch
---

`formatShortcut("")` and `ariaKeyshortcuts("")` return an empty string instead of throwing, so `useShortcutHint` renders nothing for a shortcut with no keys.
