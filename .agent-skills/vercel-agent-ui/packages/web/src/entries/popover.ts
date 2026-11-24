// Importing this defines <ui-popover> and its parts. On the server it does nothing.
import { definePopoverElements } from "../popover"

definePopoverElements()

export type {
  PopoverApi,
  PopoverArrowState,
  PopoverContentProps,
  PopoverContentState,
  PopoverController,
  PopoverDismissReason,
  PopoverFinalFocus,
  PopoverInitialFocus,
  PopoverOpenChangeReason,
  PopoverOptions,
  PopoverPayloadChangeReason,
  PopoverPrimitive,
  PopoverShortcutProps,
  PopoverShortcutState,
  PopoverTriggerProps,
  PopoverTriggerState,
} from "@ui-sdk/core/popover"
export type { PopoverEvents, UiPopoverElement } from "../events"
export { createPopoverController } from "@ui-sdk/core/popover"
