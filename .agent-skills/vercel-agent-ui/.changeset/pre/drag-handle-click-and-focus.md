---
"@ui-sdk/core": patch
---

A drag with a `threshold`, like `createReorder`'s and `createTransfer`'s, now captures the pointer once the pointer passes it. A press that lifts first clicks what was pressed, like a handle or a button inside the item, and no longer the item. Focus on an element inside a moved item, like its drag handle, now follows the item when a framework renders it as a new element in another list.
