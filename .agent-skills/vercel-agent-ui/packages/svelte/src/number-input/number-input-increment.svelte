<!--
@component
Steps up once, then repeats while held. Shift steps by `largeStep`.
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

  const increment = useHandlePart(
    useNumberInput("NumberInputIncrement"),
    "increment",
    () => ({ disabled })
  )
</script>

<Part tag="button" part={increment} {props} />
