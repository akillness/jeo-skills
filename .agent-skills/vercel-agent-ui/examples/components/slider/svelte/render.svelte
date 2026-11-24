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

<Field>
  <Slider defaultValue={60}>
    <div data-slot="row">
      <FieldLabel>Brightness</FieldLabel>
      <SliderValue>
        {#snippet children(state)}{state.text}%{/snippet}
      </SliderValue>
    </div>
    <SliderControl>
      <SliderTrack>
        <SliderIndicator />
        <SliderThumb>
          {#snippet render({ props, state, children })}
            <span {...props}>{@render children?.(state)}</span>
          {/snippet}
          {#snippet children(state)}
            <span data-slot="output">{state.thumbValue}</span>
          {/snippet}
        </SliderThumb>
      </SliderTrack>
    </SliderControl>
  </Slider>
</Field>
