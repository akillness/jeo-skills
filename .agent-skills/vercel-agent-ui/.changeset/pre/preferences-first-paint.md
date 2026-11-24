---
"@ui-sdk/react": patch
---

`Preferences` puts a global preference's value on `<html>` before the first paint when it mounts in the browser, like after a client navigation mounts `<html>` again.
