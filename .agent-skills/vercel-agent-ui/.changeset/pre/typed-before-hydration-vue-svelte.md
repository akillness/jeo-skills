---
"@ui-sdk/core": patch
---

Text typed into a Combobox, Autocomplete, Command, Number Input, Date Picker or Color Picker before a Vue or Svelte page hydrates now stays, as it already did in React. Vue and Svelte write a field's value while they hydrate, so the text is read as the first component is made and goes in once hydration is done.
