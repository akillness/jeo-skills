---
"@ui-sdk/core": patch
---

Typing inside the label a Combobox shows for its value keeps the caret where it is. The first edit after a choice moved it to the end.

A text field whose value core writes, like the Combobox input and the Password Input, is written only when its value changes. So an edit the owner of a controlled value ignores, without changing the value, stays in the field instead of being replaced by the same value.
