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
  <Slider defaultValue={50} disabled>
    <div data-slot="row">
      <FieldLabel>Brightness</FieldLabel>
      <SliderValue />
    </div>
    <SliderControl>
      <SliderTrack>
        <SliderIndicator />
        <SliderThumb />
      </SliderTrack>
    </SliderControl>
  </Slider>
  <FieldDescription>Managed by your organization.</FieldDescription>
</Field>
