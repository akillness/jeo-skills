---
"@ui-sdk/core": patch
---

An agent's `setValue` is now refused on a Combobox or Select that renders its own items and shows none once open, as it already was for one whose `items` data is empty. A Combobox with `allowCustomValue` still takes the text.
