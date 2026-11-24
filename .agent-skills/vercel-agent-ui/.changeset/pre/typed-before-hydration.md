---
"@ui-sdk/core": patch
---

In React, Combobox, Autocomplete, Command, Number Input, Date Picker and Color Picker inputs keep text typed before hydration, and take it as typing when they hydrate. A field that already lost focus settles the text as a blur would.
