<!--
@component
One slide. It's labelled "1 of 5" unless it has an `aria-label`, and inert while out of view.
@stable
-->
<script lang="ts">
  import { carousel, type CarouselItemState } from "@ui-sdk/core/carousel"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let props: PartProps<"div", CarouselItemState> = $props()

  const id = $props.id()
  const item = usePart(carousel, "item", () => ({ id }))
</script>

<Part tag="div" part={item} {props} />
