---
"@ui-sdk/core": patch
"@ui-sdk/vue": patch
"@ui-sdk/svelte": patch
---

Combobox's `autoHighlight` takes `"selected"`: opening the list highlights the selected item, so the arrow keys move on from it, and highlights nothing when none is selected. While typing, it highlights the first match, like `true`.
