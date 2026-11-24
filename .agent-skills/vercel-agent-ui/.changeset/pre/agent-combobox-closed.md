---
"@ui-sdk/core": patch
---

An agent's `setValue` on a Combobox now refuses a value that isn't one of its items, as a Select does, unless the Combobox has `allowCustomValue`.
