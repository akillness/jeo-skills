---
"@ui-sdk/core": patch
"@ui-sdk/vue": patch
"@ui-sdk/svelte": patch
"@ui-sdk/solid": patch
---

Pagination takes `disabled`: every page and step then does what a step at its end does (`aria-disabled`, `data-disabled`, no `href`, presses ignored), and the root gets `data-disabled`. A controller still changes the page.
