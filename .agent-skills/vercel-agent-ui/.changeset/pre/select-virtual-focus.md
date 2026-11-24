---
"@ui-sdk/core": patch
"@ui-sdk/react": patch
"@ui-sdk/vue": patch
"@ui-sdk/svelte": patch
"@ui-sdk/solid": patch
"@ui-sdk/web": patch
---

Select takes `virtualFocus` to keep focus on the trigger while the list is open, as on a native select. Arrow keys, Home, End and typing move the highlight, the trigger points at it with `aria-activedescendant`, and Tab closes the list and moves on.
