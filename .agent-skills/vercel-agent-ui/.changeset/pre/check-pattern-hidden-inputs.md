---
"@ui-sdk/core": patch
---

`checkPattern` now leaves out elements hidden from screen readers, like the hidden native inputs a Radio Group or a Checkbox Group renders for forms, so those groups pass their patterns.
