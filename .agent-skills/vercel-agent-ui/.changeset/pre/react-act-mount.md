---
"@ui-sdk/core": patch
"@ui-sdk/react": patch
---

Mounting a Field, Select, Combobox or Autocomplete inside a synchronous `act()`, like Testing Library's `render`, no longer logs "An update was not wrapped in act(...)". The store writes their parts make as they bind now land in the same commit.
