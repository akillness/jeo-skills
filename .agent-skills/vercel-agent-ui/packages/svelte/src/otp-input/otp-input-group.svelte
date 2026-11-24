<!--
@component
Lays out a run of slots.
@stable
-->
<script lang="ts">
  import { otpInput, type OTPInputState } from "@ui-sdk/core/otp-input"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let props: PartProps<"div", OTPInputState> = $props()

  const group = usePart(otpInput, "group")
</script>

<Part tag="div" part={group} {props} />
