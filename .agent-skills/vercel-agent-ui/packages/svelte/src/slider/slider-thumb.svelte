<!--
@component
A thumb, with the native range input that takes focus inside it. Its
`aria-label`, `aria-labelledby` and `aria-describedby` go to that input.
@stable
-->
<script lang="ts">
  import type { SliderThumbProps, SliderThumbState } from "@ui-sdk/core/slider"
  import Part from "../part.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { useSlider } from "./context"

  let {
    index = 0,
    "aria-label": label,
    "aria-labelledby": labelledBy,
    "aria-describedby": describedBy,
    children,
    ...rest
  }: PartProps<"div", SliderThumbState> & SliderThumbProps = $props()

  const slider = useSlider("SliderThumb")
  const thumb = useHandlePart(slider, "thumb", () => ({
    index,
    id: String(index),
  }))
  // The input's range ends at its neighbours, so it hears their moves and its
  // own, and the thumb and its content don't.
  const input = useHandlePart(slider, "thumb-input", () => ({
    index,
    id: String(index),
  }))
  const field = slider.field()
  const control = field?.control(
    () => input.attrs.id,
    () => describedBy
  )
  const named = $derived({
    "aria-label": label,
    "aria-labelledby": labelledBy,
    "aria-describedby": describedBy,
  })
</script>

{#snippet content(state: SliderThumbState)}
  {@render children?.(state)}
  <input {...control ? control(input.slot(named)) : input.slot(named)} />
{/snippet}

<Part tag="div" part={thumb} props={{ ...rest, children: content }} />
