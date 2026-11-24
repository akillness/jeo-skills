<!--
@component
Drag across it to change the value. It works anywhere inside the number
input, and outside it through `controller`, like an icon in a toolbar.
@stable
-->
<script lang="ts">
  import type {
    NumberInputScrubAreaProps,
    NumberInputState,
  } from "@ui-sdk/core/number-input"
  import { getContext } from "svelte"
  import { useControllerTarget } from "../controller-target.svelte"
  import Part from "../part.svelte"
  import { plainPart, type PartProps } from "../use-primitive.svelte"
  import { NumberInputKey, type NumberInputContext } from "./context"
  import ScrubAreaBinding from "./number-input-scrub-area-binding.svelte"

  let {
    orientation,
    pixelsPerStep,
    controller,
    ...rest
  }: PartProps<"span", NumberInputState> & NumberInputScrubAreaProps = $props()

  const connected = useControllerTarget(
    () => controller,
    getContext<NumberInputContext | undefined>(NumberInputKey)
  )
  const numberInput = $derived(connected())
  // What a scrub area outside its number input renders with until that mounts.
  const unconnected: NumberInputState = {
    value: null,
    disabled: false,
    readOnly: false,
    required: false,
    scrubbing: false,
  }
</script>

{#if numberInput}
  <!-- A new number input needs a new part, bound to its instance. -->
  {#key numberInput}
    <ScrubAreaBinding
      owner={numberInput}
      {orientation}
      {pixelsPerStep}
      {...rest}
    />
  {/key}
{:else}
  <!-- Until the number input it names mounts, a scrub area outside it is a plain span. -->
  <Part tag="span" part={plainPart(unconnected)} props={rest} />
{/if}
