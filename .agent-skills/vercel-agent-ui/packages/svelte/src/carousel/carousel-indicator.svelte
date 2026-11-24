<!--
@component
Shows a page and goes to it. Indicators past the page count hide themselves.
@stable
-->
<script lang="ts">
  import {
    carousel as carouselPrimitive,
    type CarouselIndicatorProps,
    type CarouselIndicatorState,
  } from "@ui-sdk/core/carousel"
  import { getContext } from "svelte"
  import Part from "../part.svelte"
  import { plainPart, type PartProps } from "../use-primitive.svelte"
  import type { CarouselContext } from "./context"
  import CarouselIndicatorBinding from "./carousel-indicator-binding.svelte"

  let {
    page,
    ...rest
  }: PartProps<"button", CarouselIndicatorState> & CarouselIndicatorProps =
    $props()

  // In a group outside its carousel, before that mounts, it's a plain button.
  const carousel = getContext<CarouselContext | undefined>(carouselPrimitive)
</script>

{#if carousel}
  <CarouselIndicatorBinding owner={carousel} {page} {...rest} />
{:else}
  <Part
    tag="button"
    part={plainPart({ page: page ?? 0, selected: false }, { type: "button" })}
    props={rest}
  />
{/if}
