<!--
@component
The scrolling window onto the slides. Touch, wheels and keys scroll it natively.
@stable
-->
<script lang="ts">
  import { carousel, type CarouselViewportState } from "@ui-sdk/core/carousel"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let props: PartProps<"div", CarouselViewportState> = $props()

  const viewport = usePart(carousel, "viewport")
</script>

<Part tag="div" part={viewport} {props} />
