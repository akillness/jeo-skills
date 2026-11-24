<!--
@component
The row, or column, of slides inside the viewport.
@stable
-->
<script lang="ts">
  import { carousel, type CarouselContentState } from "@ui-sdk/core/carousel"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let props: PartProps<"div", CarouselContentState> = $props()

  const content = usePart(carousel, "content")
</script>

<Part tag="div" part={content} {props} />
