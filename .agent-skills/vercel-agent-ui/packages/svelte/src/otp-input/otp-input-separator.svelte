<!--
@component
Drawn between groups, like a dash.
@stable
-->
<script lang="ts">
  import { otpInput, type OTPInputState } from "@ui-sdk/core/otp-input"
  import Part from "../part.svelte"
  import { usePart } from "../instance"
  import type { PartProps } from "../use-primitive.svelte"

  let props: PartProps<"div", OTPInputState> = $props()

  const separator = usePart(otpInput, "separator")
</script>

<Part tag="div" part={separator} {props} />
