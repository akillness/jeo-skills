<!--
@component
The rail the thumbs move along. Positions are percentages of it.
@stable
-->
<script lang="ts">
  import type { SliderState } from "@ui-sdk/core/slider"
  import Part from "../part.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { useSlider } from "./context"

  let props: PartProps<"div", SliderState> = $props()

  const track = useHandlePart(useSlider("SliderTrack"), "track")
</script>

<Part tag="div" part={track} {props} />
