---
"@ui-sdk/core": patch
---

A NumberInput step now keeps its value when `onValueChange` moves focus out of the field. The blur asked for the old value again, which dropped the step.
