---
"@ui-sdk/core": patch
---

An exit animation reads an empty duration as none, and async options read a loader that resolves to nothing as no items, instead of staying `loading`.
