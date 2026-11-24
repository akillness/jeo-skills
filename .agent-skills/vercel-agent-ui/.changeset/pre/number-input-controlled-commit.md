---
"@ui-sdk/core": patch
---

A NumberInput with a controlled `value` now commits the value that Enter or blur clamped or snapped it to. `onValueCommit` got the value from before, or didn't run.
