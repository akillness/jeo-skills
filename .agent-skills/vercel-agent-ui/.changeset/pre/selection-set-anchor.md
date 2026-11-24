---
"@ui-sdk/core": patch
---

`createSelection` returns `setAnchor(key)`, which starts the next Shift range at `key` without changing the selection, for lists where arrow keys move focus without selecting. `null` clears the anchor.
