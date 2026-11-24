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
</script>

{#snippet ticks(count: number)}
  <div data-slot="ticks" aria-hidden="true">
    {#each { length: count }, index (index)}
      <span></span>
    {/each}
  </div>
{/snippet}

<div data-slot="stack">
  <Field>
    <Slider
      defaultValue={2010}
      min={1990}
      max={2030}
      step={5}
      format={{ useGrouping: false }}
    >
      <div data-slot="row">
        <FieldLabel>Year</FieldLabel>
        <SliderValue />
      </div>
      <SliderControl>
        <SliderTrack>
          <SliderIndicator />
          <SliderThumb />
        </SliderTrack>
      </SliderControl>
      {@render ticks(9)}
    </Slider>
  </Field>
  <Field>
    <Slider defaultValue={0.5} min={0} max={1} step={0.05}>
      <div data-slot="row">
        <FieldLabel>Opacity</FieldLabel>
        <SliderValue />
      </div>
      <SliderControl>
        <SliderTrack>
          <SliderIndicator />
          <SliderThumb />
        </SliderTrack>
      </SliderControl>
      {@render ticks(21)}
    </Slider>
  </Field>
</div>
