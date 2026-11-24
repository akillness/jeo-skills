<!--
@component
Names the meter.
@stable
-->
<script lang="ts">
  import { meter, type MeterState } from "@ui-sdk/core/meter"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let props: PartProps<"span", MeterState> = $props()

  const label = usePart(meter, "label")
</script>

<Part tag="span" part={label} {props} />
