import { navigationMenu } from "@ui-sdk/core/navigation-menu"
import { createParts } from "../src/use-primitive"

const { Root: NavigationMenu } = createParts(navigationMenu, { root: "nav" })

// `T` comes from `value`, and reaches `onValueChange` and the root's state.
;<NavigationMenu
  value="products"
  onValueChange={(value) => {
    const known: "products" | null = value
    // @ts-expect-error `value` is "products" or null, not a number.
    const wrong: number = value
    void known
    void wrong
  }}
  className={(state) => (state.value === "products" ? "open" : "closed")}
/>
