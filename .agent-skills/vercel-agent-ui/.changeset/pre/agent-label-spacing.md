---
"@ui-sdk/core": patch
---

Names read from content put a space around a child that isn't plain inline, like a flex item or an inline-block, as Chromium does. An agent's label for `<button style="display: flex"><span>Read</span><span>Swedish orders</span></button>` is "Read Swedish orders", not "ReadSwedish orders".
