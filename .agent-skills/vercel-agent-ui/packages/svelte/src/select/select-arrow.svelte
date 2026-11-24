<!--
@component
An arrow on the popup's edge that points at the trigger.
@stable
-->
<script lang="ts">
  import { select, type SelectArrowState } from "@ui-sdk/core/select"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let props: PartProps<"div", SelectArrowState> = $props()

  const arrow = usePart(select, "arrow")
</script>

<Part tag="div" part={arrow} {props} />
