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
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()
  let value = $state([0.3, 0.7])
</script>

<div data-slot="stack">
  <div data-slot="controls">
    <button type="button" onclick={() => (value = [0.3, 0.7])}>Reset</button>
  </div>
  <Field>
    <Slider
      bind:value
      onValueChange={(next, details) =>
        log(`${[next].flat().join(" – ")} (${details.reason})`)}
      min={0}
      max={1}
      step={0.1}
    >
      <div data-slot="row">
        <FieldLabel>Temperature</FieldLabel>
        <SliderValue />
      </div>
      <SliderControl>
        <SliderTrack>
          <SliderIndicator />
          <SliderThumb index={0} aria-label="Minimum temperature" />
          <SliderThumb index={1} aria-label="Maximum temperature" />
        </SliderTrack>
      </SliderControl>
    </Slider>
  </Field>
</div>
