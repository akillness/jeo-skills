---
"@ui-sdk/core": patch
"@ui-sdk/react": patch
"@ui-sdk/vue": patch
"@ui-sdk/svelte": patch
"@ui-sdk/solid": patch
"@ui-sdk/web": patch
---

Combobox, Autocomplete and Listbox controllers take `highlight(value)` and `getHighlighted()`, so code can put the highlight on a particular item, like the row a cascading picker came back from. `onHighlight` fires for it, and the item scrolls into view. While focus is outside a Listbox, `highlight` gives the option the tab stop instead.
