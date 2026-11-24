import { popover } from "@ui-sdk/core/popover"
import type { PopupContainer } from "../popup.svelte"
import type { PrimitiveHandle } from "../use-primitive.svelte"

type PopoverContext = PrimitiveHandle<typeof popover>

// Where the popup renders. Set on <Popover> or <PopoverContent>.
const ContainerKey = Symbol("popover-container")
// The trigger a PopoverShortcut sits in: its shortcut, and the popover it
// opens. A trigger connected through a controller sits outside the popover,
// so its popover comes from here.
const TriggerKey = Symbol("popover-trigger")

type ContainerContext = () => PopupContainer
type TriggerContext = {
  shortcut: () => string | undefined
  popover: () => PopoverContext | undefined
}

export {
  type ContainerContext,
  ContainerKey,
  type PopoverContext,
  type TriggerContext,
  TriggerKey,
}
