<script lang="ts">
  import type {
    CarouselIndicatorProps,
    CarouselIndicatorState,
  } from "@ui-sdk/core/carousel"
  import { untrack } from "svelte"
  import Part from "../part.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import type { CarouselContext } from "./context"

  // The bound part of an indicator, once its carousel is known. `owner` is read once.
  let {
    owner,
    page,
    ...rest
  }: PartProps<"button", CarouselIndicatorState> &
    CarouselIndicatorProps & { owner: CarouselContext } = $props()

  const id = $props.id()
  const indicator = useHandlePart(
    untrack(() => owner),
    "indicator",
    () => ({ id, page })
  )
</script>

<Part tag="button" part={indicator} props={rest} />
