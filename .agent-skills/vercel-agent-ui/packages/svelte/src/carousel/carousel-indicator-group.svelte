<!--
@component
The indicators, as a tablist with one tab stop. Its children get `pageCount` in their state.
@stable
-->
<script lang="ts">
  import {
    carousel as carouselPrimitive,
    type CarouselControlProps,
    type CarouselIndicatorGroupState,
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
  }: PartProps<"div", CarouselIndicatorGroupState> & CarouselControlProps =
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
    <Connected
      owner={carousel}
      partName="indicator-group"
      tag="div"
      {...rest}
    />
  {/key}
{:else}
  <!-- Until the carousel it names mounts, a control outside the carousel is a plain element. -->
  <Part tag="div" part={plainPart({ page: 1, pageCount: null })} props={rest} />
{/if}
