---
"@ui-sdk/core": patch
---

A bottom sheet swiped off the screen closes as soon as it's out of sight, except on iOS, where the page still shows under Safari's toolbar. Before, it stayed open for up to 120px below the screen, and the next swipe could bring it back.
