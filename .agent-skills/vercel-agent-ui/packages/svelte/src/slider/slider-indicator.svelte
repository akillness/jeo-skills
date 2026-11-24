<!--
@component
The filled part of the track: up to a single thumb, or between a range's thumbs.
@stable
-->
<script lang="ts">
  import type { SliderState } from "@ui-sdk/core/slider"
  import Part from "../part.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { useSlider } from "./context"

  let props: PartProps<"div", SliderState> = $props()

  const indicator = useHandlePart(useSlider("SliderIndicator"), "indicator")
</script>

<Part tag="div" part={indicator} {props} />
