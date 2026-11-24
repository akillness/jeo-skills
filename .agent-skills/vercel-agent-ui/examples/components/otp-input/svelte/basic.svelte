<script lang="ts">
  import { MinusIcon } from "@lucide/svelte"
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import {
    OTPInput,
    OTPInputGroup,
    OTPInputSeparator,
    OTPInputSlot,
  } from "@ui-sdk/svelte/otp-input"
</script>

<Field>
  <FieldLabel>Verification code</FieldLabel>
  <OTPInput maxLength={6}>
    <OTPInputGroup>
      <OTPInputSlot index={0} />
      <OTPInputSlot index={1} />
      <OTPInputSlot index={2} />
    </OTPInputGroup>
    <OTPInputSeparator>
      <MinusIcon aria-hidden="true" />
    </OTPInputSeparator>
    <OTPInputGroup>
      <OTPInputSlot index={3} />
      <OTPInputSlot index={4} />
      <OTPInputSlot index={5} />
    </OTPInputGroup>
  </OTPInput>
</Field>
