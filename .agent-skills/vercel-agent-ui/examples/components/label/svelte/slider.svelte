<script lang="ts">
  import { Label } from "@ui-sdk/svelte/label"
  import {
    Slider,
    SliderControl,
    SliderIndicator,
    SliderThumb,
    SliderTrack,
    SliderValue,
  } from "@ui-sdk/svelte/slider"
</script>

<Slider id="volume" defaultValue={75}>
  <div data-slot="row">
    <Label for="volume">Volume</Label>
    <SliderValue />
  </div>
  <SliderControl>
    <SliderTrack>
      <SliderIndicator />
      <SliderThumb />
    </SliderTrack>
  </SliderControl>
</Slider>
