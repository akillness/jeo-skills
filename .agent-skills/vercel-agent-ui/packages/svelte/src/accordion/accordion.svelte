<!--
@component
A stack of items that each open a section of content. One item is open at a time unless `multiple` is set.
@stable
-->
<script lang="ts">
  import type { ChangeDetails } from "@ui-sdk/core"
  import {
    accordion as accordionPrimitive,
    type AccordionController,
    type AccordionState,
    type AccordionValueChangeReason,
  } from "@ui-sdk/core/accordion"
  import Part from "../part.svelte"
  import { provideInstance } from "../instance"
  import {
    useHandlePart,
    usePrimitive,
    type PartProps,
  } from "../use-primitive.svelte"

  type Details = ChangeDetails<AccordionValueChangeReason>

  let {
    value = $bindable(),
    defaultValue,
    multiple,
    collapsible,
    disabled,
    keepMounted,
    hiddenUntilFound,
    controller,
    debug,
    onValueChange,
    ...rest
  }: PartProps<"div", AccordionState> & {
    /** The open items' values. Bind it with `bind:value` to control the accordion. */
    value?: string[]
    /** The items open at first, when uncontrolled. */
    defaultValue?: string[]
    /** Whether several items can be open at once. Otherwise opening one closes the others. */
    multiple?: boolean
    /** Whether the open item can close when only one may be open. With `false`, one item always stays open. */
    collapsible?: boolean
    /** Stops every item from opening or closing. Triggers stay focusable. */
    disabled?: boolean
    /** Whether closed panels stay in the page, hidden. */
    keepMounted?: boolean
    /** Keeps closed panels in the page as `hidden="until-found"`, so find in page can open them. */
    hiddenUntilFound?: boolean
    /** Opens and closes items from anywhere. Create one with `createAccordionController()`. */
    controller?: AccordionController
    /** Logs every state change with its reason. */
    debug?: boolean
    /** Runs when items want to open or close. `details.reason` says why, and `details.cancel()` stops it. */
    onValueChange?: (value: string[], details: Details) => void
  } = $props()

  const id = $props.id()
  const accordion = usePrimitive(accordionPrimitive, () => ({
    id,
    get value() {
      return value
    },
    defaultValue,
    multiple,
    collapsible,
    disabled,
    keepMounted,
    hiddenUntilFound,
    controller,
    debug,
    onValueChange: (next: string[], details: Details) => {
      // The callback runs first, so canceling there also keeps a bound `value` as it was.
      onValueChange?.(next, details)
      if (!details.canceled) {
        value = next
      }
    },
  }))
  provideInstance(accordionPrimitive, accordion)
  const root = useHandlePart(accordion, "root")
</script>

<Part tag="div" part={root} props={rest} />
