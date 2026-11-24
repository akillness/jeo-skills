---
"@ui-sdk/core": patch
---

A sheet whose content resizes while it is still opening keeps moving to its new size. In Chrome and Safari, a resize during the opening frames threw a `TypeError` from the sheet's effects.
