---
"@ui-sdk/core": patch
---

Tabs select the `defaultValue` tab when it binds after the others, like a tab inside Suspense or `React.lazy`. The first tab stands in until it does, unless someone picks another tab first.
