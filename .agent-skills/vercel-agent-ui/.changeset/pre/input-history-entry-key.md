---
"@ui-sdk/core": patch
---

`createInputHistory` takes `getEntryKey`, so entries made again from the same messages, and a new message arriving mid-recall, keep the entry brought back in place instead of starting over.
