---
"@ui-sdk/solid": patch
---

In Solid, a `TreeItemLabel`, `TreeItemIndicator` and `TreeItemCheckbox` now follow their item. One whose item has a `TreeGroup` carries `data-branch` and `data-expanded`, so an indicator styled with them shows and turns, and a change to the item's `disabled` or `branch` reaches them.
