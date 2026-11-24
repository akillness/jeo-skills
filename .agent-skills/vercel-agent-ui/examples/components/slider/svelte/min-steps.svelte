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

  const time = (minutes: number) =>
    `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`
</script>

<Field>
  <Slider
    defaultValue={[540, 1020]}
    min={0}
    max={1440}
    step={15}
    minStepsBetweenThumbs={16}
    format={time}
  >
    <div data-slot="row">
      <FieldLabel>Opening hours</FieldLabel>
      <SliderValue />
    </div>
    <SliderControl>
      <SliderTrack>
        <SliderIndicator />
        <SliderThumb index={0} aria-label="Opens" />
        <SliderThumb index={1} aria-label="Closes" />
      </SliderTrack>
    </SliderControl>
  </Slider>
</Field>
