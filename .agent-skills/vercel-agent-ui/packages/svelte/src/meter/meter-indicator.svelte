<!--
@component
The filled part of the track, as wide as the value.
@stable
-->
<script lang="ts">
  import { meter, type MeterState } from "@ui-sdk/core/meter"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let props: PartProps<"div", MeterState> = $props()

  const indicator = usePart(meter, "indicator")
</script>

<Part tag="div" part={indicator} {props} />
