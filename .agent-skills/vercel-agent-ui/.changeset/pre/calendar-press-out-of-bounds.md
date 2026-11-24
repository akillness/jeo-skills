---
"@ui-sdk/core": patch
---

Keep focus where it was when a Calendar or Date Picker day before `min` or after `max` is pressed. Those days no longer get a `tabindex`, so no browser can focus them, as the docs say.
