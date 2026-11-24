---
"@ui-sdk/core": patch
---

A quick click on a Menu or Select trigger no longer counts as a press held to drag when the page is busy rendering what it opened. The hold is timed by when the press and release happened, not by when their handlers ran, so the menu no longer closes and the select no longer chooses the option under the pointer.
