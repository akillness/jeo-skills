---
"@ui-sdk/core": patch
---

A Tree builds its collection once for each new `items` or `paths` array. While a new array rendered, it rebuilt the collection several times, which slowed a reorder in a large tree.
