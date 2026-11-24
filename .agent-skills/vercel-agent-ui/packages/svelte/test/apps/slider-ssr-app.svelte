<script lang="ts">
  import {
    Slider,
    SliderControl,
    SliderIndicator,
    SliderThumb,
    SliderTrack,
    SliderValue,
  } from "../../src/slider"
</script>

<Slider name="price" defaultValue={[20, 80]}>
  <SliderValue />
  <SliderControl>
    <SliderTrack>
      <SliderIndicator />
      <SliderThumb index={0} aria-label="Minimum" />
      <SliderThumb index={1} aria-label="Maximum" />
    </SliderTrack>
  </SliderControl>
</Slider>
