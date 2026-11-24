---
"@ui-sdk/core": patch
---

`@ui-sdk/core/testing` exports `settle`, which waits for what a component schedules after a render or an event, like a tooltip's name or focus moving into a menu. Framework tests can now wait the way `mount`'s `view.settle()` does.
