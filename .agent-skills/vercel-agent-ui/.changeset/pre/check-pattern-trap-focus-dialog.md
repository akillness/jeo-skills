---
"@ui-sdk/core": patch
---

`checkPattern(el, "dialog")` passes a dialog that only traps focus, like a popover with `modal="trap-focus"`: it asks for `aria-modal="true"` when the page behind the dialog is inert, and no longer when Tab stays inside while the page stays usable.
