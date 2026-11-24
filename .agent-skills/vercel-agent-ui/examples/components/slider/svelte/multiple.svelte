<script lang="ts">
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import {
    Slider,
    SliderControl,
    SliderIndicator,
    SliderThumb,
    SliderTrack,
    SliderValue,
  } from "@ui-sdk/svelte/slider"

  const thumbs = ["Low", "Medium", "High"]
</script>

<Field>
  <Slider
    defaultValue={[10, 20, 70]}
    step={10}
    format={{ style: "unit", unit: "percent" }}
  >
    <div data-slot="row">
      <FieldLabel>Alert thresholds</FieldLabel>
      <SliderValue />
    </div>
    <SliderControl>
      <SliderTrack>
        <SliderIndicator />
        {#each thumbs as label, index (label)}
          <SliderThumb {index} aria-label={label} />
        {/each}
      </SliderTrack>
    </SliderControl>
  </Slider>
</Field>
