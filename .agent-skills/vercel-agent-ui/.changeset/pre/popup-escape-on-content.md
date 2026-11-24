---
"@ui-sdk/core": patch
---

Popover, Dialog, Drawer, Select and Date Picker handle Escape on their content, before it bubbles, so an ancestor's keydown listener sees `defaultPrevented` instead of acting on the same Escape. A field inside the popup can still handle Escape first and keep it open.
