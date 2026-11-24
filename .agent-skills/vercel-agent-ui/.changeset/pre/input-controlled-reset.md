---
"@ui-sdk/core": patch
---

A form reset returns a controlled Input with a `defaultValue` to that default, through `onValueChange` with reason `"reset"`, as Textarea and the other form controls already did. The reset used to read the element's own default, which React moves with a controlled input's value.
