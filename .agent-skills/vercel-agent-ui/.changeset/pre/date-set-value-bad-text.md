---
"@ui-sdk/core": patch
---

A Calendar or Date Picker's `setValue` given text that isn't a date, or a range with one end, now returns `false` and keeps the value. It no longer clears the selection.
