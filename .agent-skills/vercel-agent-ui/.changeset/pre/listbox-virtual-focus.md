---
"@ui-sdk/core": patch
"@ui-sdk/react": patch
"@ui-sdk/vue": patch
"@ui-sdk/svelte": patch
"@ui-sdk/solid": patch
"@ui-sdk/web": patch
---

Listbox takes `virtualFocus` to keep focus on the list itself. Arrow keys, Home, End and typing move a highlight, the list points at it with `aria-activedescendant`, and a press chooses an option without moving focus.
