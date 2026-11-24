---
"@ui-sdk/core": patch
---

Scroll Area takes its first measurement in its resize observer's first call, once the frame has laid it out, instead of in a microtask that forced style and layout of the new content, and registers its frame variables ahead of time instead of as the root binds.
