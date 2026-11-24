<!--
@component
The rail the indicator fills.
@stable
-->
<script lang="ts">
  import { meter, type MeterState } from "@ui-sdk/core/meter"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let props: PartProps<"div", MeterState> = $props()

  const track = usePart(meter, "track")
</script>

<Part tag="div" part={track} {props} />
