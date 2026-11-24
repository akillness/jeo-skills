---
"@ui-sdk/core": patch
---

Slider's `onValueChange` and `onValueCommit` type their value as the slider's own value type, `number` or `number[]`, where it was `number | (number[] & number)`.
