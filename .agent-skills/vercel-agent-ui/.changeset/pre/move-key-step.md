---
"@ui-sdk/core": patch
---

`createMove`'s Alt and arrow nudges land on `step`'s grid, as drops do, so a `step` below 1 nudges by that step instead of rounding to whole units.
