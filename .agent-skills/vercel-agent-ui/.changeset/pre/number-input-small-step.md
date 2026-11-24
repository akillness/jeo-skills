---
"@ui-sdk/core": patch
---

Number Input's default small step (a tenth of `step`) no longer carries floating point noise, so Alt+ArrowUp with `step: 0.7` from 1 gives 1.05, not 1.0499999999999998.
