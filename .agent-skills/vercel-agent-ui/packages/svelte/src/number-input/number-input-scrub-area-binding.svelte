<script lang="ts">
  import type {
    NumberInputScrubAreaProps,
    NumberInputState,
  } from "@ui-sdk/core/number-input"
  import { setContext, untrack } from "svelte"
  import Part from "../part.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { NumberInputKey, type NumberInputContext } from "./context"

  // The scrub area once it has its number input, which it passes on to the
  // cursor inside. `owner` is read once: a new number input gets a new binding.
  let {
    owner,
    orientation,
    pixelsPerStep,
    ...rest
  }: PartProps<"span", NumberInputState> &
    Omit<NumberInputScrubAreaProps, "controller"> & {
      owner: NumberInputContext
    } = $props()

  const numberInput = untrack(() => owner)
  setContext(NumberInputKey, numberInput)
  const scrub = useHandlePart(numberInput, "scrub-area", () => ({
    orientation,
    pixelsPerStep,
  }))
</script>

<Part tag="span" part={scrub} props={rest} />
