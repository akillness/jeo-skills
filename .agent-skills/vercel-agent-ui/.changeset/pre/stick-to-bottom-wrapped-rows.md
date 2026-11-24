---
"@ui-sdk/core": patch
---

`createStickToBottom` keeps the rows in view still when rows above them go, also when the rows sit in a wrapper, like a Scroll Area's content. Before, only rows that were the scroller's own children stayed put.
