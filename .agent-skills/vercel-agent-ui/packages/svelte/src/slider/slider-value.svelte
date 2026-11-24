<!--
@component
The formatted value, a range joined with an en dash. Content replaces it.
@stable
-->
<script lang="ts">
  import type { SliderValueState } from "@ui-sdk/core/slider"
  import Part from "../part.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { useSlider } from "./context"

  let { children, ...rest }: PartProps<"output", SliderValueState> = $props()

  const value = useHandlePart(useSlider("SliderValue"), "value")
</script>

{#snippet text(state: SliderValueState)}{state.text}{/snippet}

<Part
  tag="output"
  part={value}
  props={{ ...rest, children: children ?? text }}
/>
