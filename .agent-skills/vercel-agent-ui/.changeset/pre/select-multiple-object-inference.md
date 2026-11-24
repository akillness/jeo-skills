---
"@ui-sdk/core": patch
---

Select, Combobox and Listbox with `multiple` infer an inline list of objects as a list of that object, not of the object or a list. A single select whose one value is an inline list now needs its type, like `Select<Item[]>`.
