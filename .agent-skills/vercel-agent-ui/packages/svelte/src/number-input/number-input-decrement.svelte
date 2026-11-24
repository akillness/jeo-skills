<!--
@component
Steps down once, then repeats while held. Shift steps by `largeStep`.
@stable
-->
<script lang="ts">
  import type {
    NumberInputButtonProps,
    NumberInputButtonState,
  } from "@ui-sdk/core/number-input"
  import Part from "../part.svelte"
  import { useHandlePart, type PartProps } from "../use-primitive.svelte"
  import { useNumberInput } from "./context"

  let {
    disabled,
    ...props
  }: PartProps<"button", NumberInputButtonState> & NumberInputButtonProps =
    $props()

  const decrement = useHandlePart(
    useNumberInput("NumberInputDecrement"),
    "decrement",
    () => ({ disabled })
  )
</script>

<Part tag="button" part={decrement} {props} />
