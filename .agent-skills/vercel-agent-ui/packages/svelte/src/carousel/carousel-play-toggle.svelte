<!--
@component
Starts and stops rotation. Label it from `playing` in its state, as the carousel pattern asks.
@stable
-->
<script lang="ts">
  import {
    carousel as carouselPrimitive,
    type CarouselControlProps,
    type CarouselPlayToggleState,
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
  }: PartProps<"button", CarouselPlayToggleState> & CarouselControlProps =
    $props()

  const connected = useControllerTarget(
    () => controller,
    getContext<CarouselContext | undefined>(carouselPrimitive)
  )
  const carousel = $derived(connected())
</script>

{#if carousel}
  <!-- A new carousel needs a new part, bound to its instance. -->
  {#key carousel.instance.id}
    <Connected owner={carousel} partName="play-toggle" tag="button" {...rest} />
  {/key}
{:else}
  <!-- Until the carousel it names mounts, a control outside the carousel is a plain element. -->
  <Part
    tag="button"
    part={plainPart({ playing: false, paused: false }, { type: "button" })}
    props={rest}
  />
{/if}
