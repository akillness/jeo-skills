<script lang="ts">
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import {
    createSliderController,
    Slider,
    SliderControl,
    SliderIndicator,
    SliderThumb,
    SliderTrack,
    SliderValue,
  } from "@ui-sdk/svelte/slider"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()
  const volume = createSliderController<number>()
</script>

<div data-slot="stack">
  <div data-slot="controls">
    <button type="button" onclick={() => volume.setValue(0)}>Mute</button>
    <button
      type="button"
      onclick={() => volume.setValue(volume.getValue() + 10)}>Louder</button
    >
    <button type="button" onclick={() => log(`Volume is ${volume.getValue()}`)}
      >Read</button
    >
    <button type="button" onclick={() => volume.focus()}>Focus</button>
  </div>
  <Field>
    <Slider
      defaultValue={40}
      controller={volume}
      onValueChange={(value, details) =>
        log(`Volume ${value} (${details.reason})`)}
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
  </Field>
</div>
