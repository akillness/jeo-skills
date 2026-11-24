<!--
@component
One item: a header with its trigger, and the panel the trigger opens.
@stable
-->
<script lang="ts">
  import type { ChangeDetails } from "@ui-sdk/core"
  import {
    accordion as accordionPrimitive,
    type AccordionItemProps,
    type AccordionItemState,
    type AccordionValueChangeReason,
  } from "@ui-sdk/core/accordion"
  import { setContext } from "svelte"
  import Part from "../part.svelte"
  import { useHandle } from "../instance"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { ItemKey, type ItemContext } from "./context"

  type Details = ChangeDetails<AccordionValueChangeReason>

  let {
    value,
    disabled,
    onOpenChange,
    onOpenChangeComplete,
    ...rest
  }: PartProps<"div", AccordionItemState> & AccordionItemProps = $props()

  const accordion = useHandle(accordionPrimitive)
  const generated = $props.id()
  const itemValue = () => value ?? generated
  setContext<ItemContext>(ItemKey, itemValue)
  const item = useHandlePart(accordion, "item", () => ({
    value: itemValue(),
    disabled,
    onOpenChange: (open: boolean, details: Details) =>
      onOpenChange?.(open, details),
    onOpenChangeComplete: (open: boolean) => onOpenChangeComplete?.(open),
  }))
</script>

<Part tag="div" part={item} props={rest} />
