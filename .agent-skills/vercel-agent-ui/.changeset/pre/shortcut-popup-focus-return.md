---
"@ui-sdk/core": patch
---

A popup opened by a key pressed away from its trigger returns focus to where it was opened from when it closes, not to the trigger. A Dialog trigger's `shortcut` pressed in a field returns focus to the field, and a Date Picker opened with Alt+ArrowDown in its input returns focus to the input.
