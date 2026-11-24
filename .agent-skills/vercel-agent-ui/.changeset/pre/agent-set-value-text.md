---
"@ui-sdk/core": patch
---

An agent's `setValue` now refuses numeric text with grouped digits, like `"1,499.5"`, which used to set `1`. One value or label for a component that holds a list, like a multiple Select or a Checkbox Group, now sets a list of one.
