---
"@ui-sdk/core": patch
---

Uncontrolled Tabs keep their `defaultValue` selected while that tab's server markup waits for its boundary to hydrate, instead of selecting the first tab beside it, so streaming no longer shows two selected tabs or a hydration warning.
