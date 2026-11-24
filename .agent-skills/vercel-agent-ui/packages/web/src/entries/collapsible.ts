// Importing this defines <ui-collapsible> and its parts. On the server it does nothing.
import { defineCollapsibleElements } from "../collapsible"

defineCollapsibleElements()

export type {
  CollapsibleApi,
  CollapsibleChangeOptions,
  CollapsibleController,
  CollapsibleOpenChangeReason,
  CollapsibleOptions,
  CollapsiblePanelProps,
  CollapsiblePanelState,
  CollapsiblePrimitive,
  CollapsibleState,
  CollapsibleTriggerProps,
  CollapsibleTriggerState,
} from "@ui-sdk/core/collapsible"
export type { CollapsibleEvents, UiCollapsibleElement } from "../events"
export { createCollapsibleController } from "@ui-sdk/core/collapsible"
