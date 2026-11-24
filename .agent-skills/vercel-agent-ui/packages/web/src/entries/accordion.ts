// Importing this defines <ui-accordion> and its parts. On the server it does nothing.
import { defineAccordionElements } from "../accordion"

defineAccordionElements()

export type {
  AccordionApi,
  AccordionChangeOptions,
  AccordionController,
  AccordionHeaderProps,
  AccordionHeaderState,
  AccordionItemProps,
  AccordionItemState,
  AccordionOptions,
  AccordionPanelProps,
  AccordionPanelState,
  AccordionPrimitive,
  AccordionState,
  AccordionTriggerProps,
  AccordionTriggerState,
  AccordionValueChangeReason,
} from "@ui-sdk/core/accordion"
export type { AccordionEvents, UiAccordionElement } from "../events"
export { createAccordionController } from "@ui-sdk/core/accordion"
