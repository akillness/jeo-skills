<script lang="ts">
  import { carousel } from "@ui-sdk/core/carousel"
  import { untrack, type Snippet } from "svelte"
  import Part from "../part.svelte"
  import { provideInstance } from "../instance"
  import { useHandlePart, type SlotAttributes } from "../use-primitive.svelte"
  import type { CarouselContext } from "./context"

  // The bound part of a control that also works outside its carousel, once
  // the carousel is known. `owner` and `partName` are read once: a control
  // finds another carousel by rendering again. Indicators inside the group
  // find the carousel through it. The element's attributes are typed by the
  // control, so here they're anything.
  let {
    owner,
    partName,
    tag,
    ...rest
  }: {
    owner: CarouselContext
    partName: "previous" | "next" | "indicator-group" | "play-toggle"
    tag: string
    render?: Snippet<
      [{ props: SlotAttributes; state: any; children?: Snippet<[any]> }]
    >
    children?: Snippet<[any]>
    [attribute: string]: unknown
  } = $props()

  provideInstance(
    carousel,
    untrack(() => owner)
  )
  const part = useHandlePart(
    untrack(() => owner),
    untrack(() => partName)
  )
</script>

<Part {tag} {part} props={rest} />
