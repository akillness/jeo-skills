---
"@ui-sdk/core": patch
---

A `bindScrollPicker` wheel whose value is set from outside, like a controlled Listbox or an agent's `setValue`, moves focus from the old option to the new one when focus was on the wheel. A Drawer settling around the wheel no longer scrolls it back to the old option.
