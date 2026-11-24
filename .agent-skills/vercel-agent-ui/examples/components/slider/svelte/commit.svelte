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
</script>

<Field>
  <Slider
    onValueCommit={(value, details) =>
      log(`Saved ${value} (${details.reason})`)}
    defaultValue={50}
  >
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
</Field>
