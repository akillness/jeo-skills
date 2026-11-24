---
"@ui-sdk/core": patch
---

Leave a `value` wrapper another layer added after a text control bound, like a testing library's, in place when the control unbinds, so it keeps hearing writes under React StrictMode.
