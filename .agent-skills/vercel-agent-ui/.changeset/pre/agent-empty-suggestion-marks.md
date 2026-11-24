---
"@ui-sdk/core": patch
---

An agent can't choose a combobox's empty-query suggestion that the open list doesn't show, like one a query hides, since its marks can't be read. A marked option that mounts a moment after the list opens is waited for, so its confirm is still asked.
