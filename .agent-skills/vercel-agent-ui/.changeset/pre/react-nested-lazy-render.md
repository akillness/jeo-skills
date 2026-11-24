---
"@ui-sdk/react": patch
---

A part takes a `render` element from a Server Component that arrives inside two lazy wrappers, as `next dev` sends it on some routes. It threw "Element type is invalid" there, where a production build worked.
