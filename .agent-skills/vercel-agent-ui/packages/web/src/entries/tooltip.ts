// Importing this defines <ui-tooltip> and its parts. On the server it does nothing.
import { defineTooltipElements } from "../tooltip"

defineTooltipElements()

export type {
  TooltipApi,
  TooltipArrowState,
  TooltipContentProps,
  TooltipContentState,
  TooltipController,
  TooltipOpenChangeReason,
  TooltipOptions,
  TooltipPayloadChangeReason,
  TooltipPrimitive,
  TooltipShortcutProps,
  TooltipShortcutState,
  TooltipTriggerProps,
  TooltipTriggerState,
} from "@ui-sdk/core/tooltip"
export type { TooltipEvents, UiTooltipElement } from "../events"
export { createTooltipController } from "@ui-sdk/core/tooltip"
