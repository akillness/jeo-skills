---
"@ui-sdk/vue": patch
---

The Nuxt module pre-bundles every `@ui-sdk/core` entry in one pass, so an app that imports from `@ui-sdk/core` or one of its entries no longer loads a second copy of it in `nuxt dev`.
