<!--
@component
One character of the code. Without content, it shows the character.
@stable
-->
<script lang="ts">
  import {
    otpInput,
    type OTPInputSlotProps,
    type OTPInputSlotState,
  } from "@ui-sdk/core/otp-input"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let {
    index,
    children,
    ...rest
  }: PartProps<"div", OTPInputSlotState> & OTPInputSlotProps = $props()

  // Keyed by its index, so each slot is its own element to the core.
  const slotProps = $derived({ index, id: String(index) })
  const slot = usePart(otpInput, "slot", () => slotProps)
</script>

{#snippet char(state: OTPInputSlotState)}{state.char}{/snippet}

<Part tag="div" part={slot} props={{ ...rest, children: children ?? char }} />
