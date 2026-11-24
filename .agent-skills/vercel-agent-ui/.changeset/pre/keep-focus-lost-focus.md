---
"@ui-sdk/core": patch
---

`keepFocus` moves focus to its element when focus sits on an element that was disabled or made inert, which Chrome leaves focused for a frame, or on an ancestor of the element, where Safari puts a clicked button's focus.
