import { accordion } from "@ui-sdk/core/accordion"
import { createParts } from "./use-primitive"

const parts = createParts(accordion, {
  root: "div",
  item: "div",
  header: "h3",
  trigger: "button",
  panel: "div",
})

/**
 * A stack of items that each open a section of content. One item is open at a time unless `multiple` is set.
 * `T` is inferred from `value`, `defaultValue` or `onValueChange`.
 * @stable
 */
const Accordion = parts.Root

/**
 * One item: a header with its trigger, and the panel the trigger opens.
 * @stable
 */
const AccordionItem = parts.Item

/**
 * A heading around the trigger, so screen readers can move between items by heading.
 * @stable
 */
const AccordionHeader = parts.Header

/**
 * The button that opens and closes its item's panel. Put it inside the item's `AccordionHeader`.
 * @stable
 */
const AccordionTrigger = parts.Trigger

/**
 * The content its item's trigger shows and hides.
 * @stable
 */
const AccordionPanel = parts.Panel

export { createAccordionController } from "@ui-sdk/core/accordion"
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

export {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
}
