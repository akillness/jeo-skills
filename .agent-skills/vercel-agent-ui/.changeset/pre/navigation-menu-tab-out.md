---
"@ui-sdk/core": patch
---

With a `NavigationMenuViewport`, Tab from the last item past an open panel leaves the navigation, and the panel closes. It used to go back into the panel, so Tab could never leave.
