---
"@ui-sdk/solid": patch
---

In Solid, a `FileInputItem` given spread props no longer logs a `STRICT_READ_UNTRACKED` warning in development for each file, and a `FileInputItemRemove` inside an item follows that item's `file` when it changes.
