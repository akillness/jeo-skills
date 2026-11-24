<script lang="ts">
  import { Field, FieldDescription, FieldLabel } from "@ui-sdk/svelte/field"
  import {
    Slider,
    SliderControl,
    SliderIndicator,
    SliderThumb,
    SliderTrack,
    SliderValue,
  } from "@ui-sdk/svelte/slider"
</script>

<Field>
  <Slider
    defaultValue={0.3}
    format={{ style: "percent" }}
    min={0}
    max={1}
    step={0.01}
  >
    <div data-slot="row">
      <FieldLabel>Volume</FieldLabel>
      <SliderValue />
    </div>
    <SliderControl>
      <SliderTrack>
        <SliderIndicator />
        <SliderThumb />
      </SliderTrack>
    </SliderControl>
  </Slider>
  <FieldDescription>How loud notifications play.</FieldDescription>
</Field>
