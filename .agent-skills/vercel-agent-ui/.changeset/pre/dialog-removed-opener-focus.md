---
"@ui-sdk/core": patch
---

Return focus to the next control when a dialog's action removes the element that opened it, like a confirm dialog that deletes its row. A dialog opened without a trigger now remembers where the element focused before it sat, a return target removed as the close renders hands focus on, and `finalFocus` applies to a dialog unmounted while open.
