---
"@ui-sdk/core": patch
---

`checkPattern` passes read-only controls: a switch or checkbox with `aria-readonly="true"` is checked to keep its state on Space, and a read-only slider or radio group is no longer asked to change.
