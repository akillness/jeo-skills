import type { navigationMenu } from "@ui-sdk/core/navigation-menu"
import { getContext } from "svelte"
import type { PopupContainer } from "../popup.svelte"
import type { PrimitiveHandle } from "../use-primitive.svelte"

type NavigationMenuContext = PrimitiveHandle<typeof navigationMenu>

// The item a part is in, by value, read when needed so parts follow a new
// `value`. Null inside a nested menu's root until its own items.
const ItemKey = Symbol("navigation-menu-item")
// Where popups render. Set on <NavigationMenu>, or on the part.
const ContainerKey = Symbol("navigation-menu-container")

type ItemContext = () => string | null
type ContainerContext = () => PopupContainer

function useItem(part: string) {
  const value = getContext<ItemContext | undefined>(ItemKey)
  if (value?.() == null) {
    throw new Error(
      `<NavigationMenu${part}> must be used inside <NavigationMenuItem>.`
    )
  }
  return value as () => string
}

export {
  type ContainerContext,
  ContainerKey,
  type ItemContext,
  ItemKey,
  type NavigationMenuContext,
  useItem,
}
