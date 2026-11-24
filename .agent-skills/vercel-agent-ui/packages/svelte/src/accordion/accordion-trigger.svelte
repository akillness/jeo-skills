<!--
@component
The button that opens and closes its item's panel. Put it inside the item's `AccordionHeader`.
@stable
-->
<script lang="ts">
  import {
    accordion,
    type AccordionTriggerProps,
    type AccordionTriggerState,
  } from "@ui-sdk/core/accordion"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"
  import { useItemValue } from "./context"

  let {
    disabled,
    ...rest
  }: PartProps<"button", AccordionTriggerState> & AccordionTriggerProps =
    $props()

  const value = useItemValue()
  const trigger = usePart(accordion, "trigger", () => ({
    value: value(),
    disabled,
  }))
</script>

<Part tag="button" part={trigger} props={rest} />
