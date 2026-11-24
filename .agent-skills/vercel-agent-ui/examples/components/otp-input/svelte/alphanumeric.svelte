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
  <FieldLabel>Recovery code</FieldLabel>
  <OTPInput maxLength={8} pattern="alphanumeric">
    <OTPInputGroup>
      {#each [0, 1, 2, 3] as index (index)}
        <OTPInputSlot {index} />
      {/each}
    </OTPInputGroup>
    <OTPInputSeparator>
      <MinusIcon aria-hidden="true" />
    </OTPInputSeparator>
    <OTPInputGroup>
      {#each [4, 5, 6, 7] as index (index)}
        <OTPInputSlot {index} />
      {/each}
    </OTPInputGroup>
  </OTPInput>
</Field>
