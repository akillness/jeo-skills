---
"@ui-sdk/core": patch
---

A modal opened while another modal is open, like `confirm()` from a button inside a dialog, is no longer made inert by the one underneath, wherever its markup sits, wherever focus was and however soon after the other one it opened.
