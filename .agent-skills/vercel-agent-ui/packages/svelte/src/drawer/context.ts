import type { drawer as drawerPrimitive } from "@ui-sdk/core/drawer"
import { getContext } from "svelte"
import type { PopupContainer } from "../popup.svelte"
import type { PrimitiveHandle } from "../use-primitive.svelte"

type DrawerHandle = PrimitiveHandle<typeof drawerPrimitive>

type DrawerContext = {
  /** The instance the parts bind to. */
  handle: DrawerHandle
  /** Where the drawer renders, from the root's `container`. */
  container: () => PopupContainer
}

const DrawerKey = Symbol("drawer")
// The trigger a Shortcut part sits in: its shortcut, and the drawer it opens.
// A trigger connected through a controller sits outside the drawer, so its
// drawer comes from here.
const TriggerKey = Symbol("drawer-trigger")

type TriggerContext = {
  shortcut: () => string | undefined
  drawer: () => DrawerContext | undefined
}

function useDrawer() {
  const context = getContext<DrawerContext | undefined>(DrawerKey)
  if (!context) {
    throw new Error("Drawer parts must be used inside <Drawer>.")
  }
  return context
}

export {
  type DrawerContext,
  type DrawerHandle,
  DrawerKey,
  type TriggerContext,
  TriggerKey,
  useDrawer,
}
