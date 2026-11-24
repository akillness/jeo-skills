<script lang="ts">
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import {
    Slider,
    SliderControl,
    SliderIndicator,
    SliderThumb,
    SliderTrack,
  } from "@ui-sdk/svelte/slider"

  const channels = [
    { label: "Bass", value: 50 },
    { label: "Treble", value: 25 },
  ]
</script>

<div data-slot="row">
  {#each channels as channel (channel.label)}
    <Field>
      <Slider orientation="vertical" defaultValue={channel.value}>
        <SliderControl>
          <SliderTrack>
            <SliderIndicator />
            <SliderThumb />
          </SliderTrack>
        </SliderControl>
      </Slider>
      <FieldLabel>{channel.label}</FieldLabel>
    </Field>
  {/each}
</div>
