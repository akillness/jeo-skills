---
"@ui-sdk/core": patch
---

A Select, Combobox or Listbox no longer throws when the browser restores a value that isn't the list of keys it saved, like a number. It selects nothing.
