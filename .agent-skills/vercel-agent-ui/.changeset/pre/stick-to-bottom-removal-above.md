---
"@ui-sdk/core": patch
---

`createStickToBottom` keeps the rows in view still while not following when rows above them are removed, added or resized, like a log that drops its oldest lines. Content that arrives below while rows go above now counts as unseen.
