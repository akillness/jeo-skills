---
"@ui-sdk/core": patch
---

web.css no longer makes Chrome restyle the whole page on every DOM insertion when the page has a Combobox input with no trigger right after it, or any Date Picker. Those parts look the same as before.
