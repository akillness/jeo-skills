---
"@ui-sdk/core": patch
"@ui-sdk/react": patch
"@ui-sdk/vue": patch
"@ui-sdk/svelte": patch
"@ui-sdk/solid": patch
---

In server-rendered HTML, the control of a Field marked `invalid` now names its first shown error in `aria-describedby`, including a `FieldError` with `match`. Every error shown at once keeps an id of its own.
