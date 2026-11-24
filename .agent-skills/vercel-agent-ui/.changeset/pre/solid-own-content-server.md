---
"@ui-sdk/solid": patch
---

Select, Combobox, Autocomplete, Menu, Command and the trigger menu write no signal while the server renders them, and an open Select, Combobox or Autocomplete with `items` and its own content renders one list on the server, the one hydration keeps.
