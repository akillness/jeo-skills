---
"@ui-sdk/core": patch
---

`checkPattern(el, "listbox")` passes the open list of a select: a list a combobox opens is reached from the combobox, so it needs no tab stop of its own, and the check no longer chooses an option there.
