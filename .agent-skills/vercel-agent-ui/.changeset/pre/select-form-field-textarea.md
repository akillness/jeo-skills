---
"@ui-sdk/core": patch
"@ui-sdk/react": patch
"@ui-sdk/vue": patch
"@ui-sdk/solid": patch
"@ui-sdk/svelte": patch
---

The hidden field a Select, Combobox or Listbox renders for its form is now a `<textarea>`, so Enter in the form's one text field submits a form without a submit button, like it does next to a native `<select>`.
