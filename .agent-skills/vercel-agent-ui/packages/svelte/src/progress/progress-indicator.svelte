<!--
@component
The filled part of the track, as wide as the value.
@stable
-->
<script lang="ts">
  import { progress, type ProgressState } from "@ui-sdk/core/progress"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let props: PartProps<"div", ProgressState> = $props()

  const indicator = usePart(progress, "indicator")
</script>

<Part tag="div" part={indicator} {props} />
