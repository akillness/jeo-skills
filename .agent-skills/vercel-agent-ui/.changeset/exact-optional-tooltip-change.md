---
"@ui-sdk/core": patch
---

Under `exactOptionalPropertyTypes`, `Tooltip` typechecks in an app that checks its libraries, and a primitive's `change()` takes an `event` that may be `undefined`, like `change("open", false, { reason: "trigger-press", event })` from a method whose `event` parameter is optional.
