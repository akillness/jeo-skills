<!--
@component
An arrow on the panel's edge that points at its trigger.
@stable
-->
<script lang="ts">
  import { popover, type PopoverArrowState } from "@ui-sdk/core/popover"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let props: PartProps<"div", PopoverArrowState> = $props()

  const arrow = usePart(popover, "arrow")
</script>

<Part tag="div" part={arrow} {props} />
