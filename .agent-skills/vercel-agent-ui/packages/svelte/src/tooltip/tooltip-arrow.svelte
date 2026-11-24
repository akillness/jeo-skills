<!--
@component
An arrow on the tooltip's edge that points at its trigger.
@stable
-->
<script lang="ts">
  import { tooltip, type TooltipArrowState } from "@ui-sdk/core/tooltip"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let props: PartProps<"div", TooltipArrowState> = $props()

  const arrow = usePart(tooltip, "arrow")
</script>

<Part tag="div" part={arrow} {props} />
