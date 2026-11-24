---
"@ui-sdk/core": patch
---

The visible value of Progress and Meter is hidden from screen readers, as the docs say, so the value is read once through `aria-valuetext`. Chromium used to expose its text under the bar too.
