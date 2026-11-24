---
"@ui-sdk/core": patch
---

A `keydown` with no `key`, like the one Chrome's autofill sends, no longer throws in the shortcut listener on pages with a `ToastRegion` or any registered shortcut.
