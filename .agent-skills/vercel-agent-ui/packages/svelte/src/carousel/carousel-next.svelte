<!--
@component
Goes to the next page. `aria-disabled` on the last page without `loop`, where it stays focusable.
@stable
-->
<script lang="ts">
  import {
    carousel as carouselPrimitive,
    type CarouselControlProps,
    type CarouselNextState,
  } from "@ui-sdk/core/carousel"
  import { getContext } from "svelte"
  import Part from "../part.svelte"
  import { useControllerTarget } from "../popup.svelte"
  import { plainPart, type PartProps } from "../use-primitive.svelte"
  import Connected from "./carousel-connected.svelte"
  import type { CarouselContext } from "./context"

  let {
    controller,
    ...rest
  }: PartProps<"button", CarouselNextState> & CarouselControlProps = $props()

  const connected = useControllerTarget(
    () => controller,
    getContext<CarouselContext | undefined>(carouselPrimitive)
  )
  const carousel = $derived(connected())
</script>

{#if carousel}
  <!-- A new carousel needs a new part, bound to its instance. -->
  {#key carousel.instance.id}
    <Connected owner={carousel} partName="next" tag="button" {...rest} />
  {/key}
{:else}
  <!-- Until the carousel it names mounts, a control outside the carousel is a plain element. -->
  <Part
    tag="button"
    part={plainPart({ disabled: true }, { type: "button" })}
    props={rest}
  />
{/if}
