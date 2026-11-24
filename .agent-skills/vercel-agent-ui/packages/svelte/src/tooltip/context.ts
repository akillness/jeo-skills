import type { tooltip } from "@ui-sdk/core/tooltip"
import type { PopupContainer } from "../popup.svelte"
import type { PrimitiveHandle } from "../use-primitive.svelte"

type TooltipContext = PrimitiveHandle<typeof tooltip>

// Where the popup renders. Set on <Tooltip> or <TooltipContent>.
const ContainerKey = Symbol("tooltip-container")
// The tooltip of the trigger a TooltipShortcut sits in. A trigger connected
// through a controller sits outside the tooltip, so its tooltip comes from here.
const TriggerKey = Symbol("tooltip-trigger")

type ContainerContext = () => PopupContainer
type TriggerContext = () => TooltipContext | undefined

export {
  type ContainerContext,
  ContainerKey,
  type TooltipContext,
  type TriggerContext,
  TriggerKey,
}
