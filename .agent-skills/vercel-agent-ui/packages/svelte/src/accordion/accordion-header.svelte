<!--
@component
A heading around the trigger, so screen readers can move between items by heading.
@stable
-->
<script lang="ts">
  import {
    accordion,
    type AccordionHeaderProps,
    type AccordionHeaderState,
  } from "@ui-sdk/core/accordion"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"
  import { useItemValue } from "./context"

  let props: PartProps<"h3", AccordionHeaderState> & AccordionHeaderProps =
    $props()

  const value = useItemValue()
  const header = usePart(accordion, "header", () => ({ value: value() }))
</script>

<Part tag="h3" part={header} {props} />
