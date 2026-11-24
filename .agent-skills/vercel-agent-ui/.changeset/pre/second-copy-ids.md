---
"@ui-sdk/core": patch
---

Two copies of core on one page, like an app and an embedded widget, no longer give two anchors the same name, so an open popup stays at its own trigger. Labels without an id get ids apart too.
