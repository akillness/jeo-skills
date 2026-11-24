---
"@ui-sdk/core": patch
---

File Input's `validate` gets a second argument, `{ accepted }`, with the files of the same choice, drop or paste accepted before this one, so it can catch a duplicate within one batch.
