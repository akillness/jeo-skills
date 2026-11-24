---
"@ui-sdk/core": patch
---

A Drawer on a touch screen puts a scroll area's own inline `overflow-y` back at its largest snap point and when it closes. It used to remove it, so a list scrolled by an inline style couldn't scroll.
