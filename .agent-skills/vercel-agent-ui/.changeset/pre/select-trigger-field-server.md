---
"@ui-sdk/react": patch
"@ui-sdk/vue": patch
"@ui-sdk/svelte": patch
"@ui-sdk/solid": patch
---

A `SelectTrigger` connected through `controller` outside its `Select`, inside a `Field`, takes the field's control id and label in the server HTML, so the `FieldLabel` points at it before the page hydrates.
