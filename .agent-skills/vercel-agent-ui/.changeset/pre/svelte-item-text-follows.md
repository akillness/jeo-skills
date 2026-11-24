---
"@ui-sdk/svelte": patch
---

`SelectItemText`, `ComboboxItemText`, `CommandItemText` and `AutocompleteItemText` follow their content when it changes, like an item reused by an unkeyed `{#each}` or a count in its label. They used to keep the first text they rendered. A label that changes while a search marks it updates once the search clears.
