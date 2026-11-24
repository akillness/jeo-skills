<!--
@component
Where presses land. A press on the track moves the nearest thumb there.
@stable
-->
<script lang="ts">
  import type { SliderState } from "@ui-sdk/core/slider"
  import Part from "../part.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { useSlider } from "./context"

  let props: PartProps<"div", SliderState> = $props()

  const control = useHandlePart(useSlider("SliderControl"), "control")
</script>

<Part tag="div" part={control} {props} />
