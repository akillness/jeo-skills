---
"@ui-sdk/core": patch
---

An agent can no longer change a read-only `Input` or `Textarea`. Its snapshot shows `disabled: true` with no actions, and `required: true` for a required one.
