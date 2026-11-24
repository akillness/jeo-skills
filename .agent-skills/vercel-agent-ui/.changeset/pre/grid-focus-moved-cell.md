---
"@ui-sdk/core": patch
---

`createGridFocus` finds a cell by the row and column its part last rendered with, not the ones it had when it bound. A keyed cell that a sort or a filter moves to another row, keeping its element, is now reached there by the arrow keys in every adapter. A drag selection from `createCellRange` finds the cell under the pointer the same way.
