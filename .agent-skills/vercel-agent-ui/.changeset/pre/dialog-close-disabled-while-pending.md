---
"@ui-sdk/core": patch
---

Dialog and Alert Dialog: while one Close part's action runs, the other Close parts get `aria-disabled` and `data-disabled`, since presses on them are refused until it settles.
