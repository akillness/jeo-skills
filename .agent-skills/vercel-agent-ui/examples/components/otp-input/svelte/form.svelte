<script lang="ts">
  import {
    Field,
    FieldDescription,
    FieldError,
    FieldLabel,
  } from "@ui-sdk/svelte/field"
  import {
    OTPInput,
    OTPInputGroup,
    OTPInputSlot,
  } from "@ui-sdk/svelte/otp-input"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()

  function onsubmit(event: SubmitEvent & { currentTarget: HTMLFormElement }) {
    event.preventDefault()
    const data = [...new FormData(event.currentTarget)].map(
      ([name, value]) => `${name}=${value}`
    )
    log(`Submitted ${data.join(", ")}`)
  }
</script>

<div data-slot="stack">
  <form id="verify-sign-in" {onsubmit}>
    <Field>
      <FieldLabel>Verification code</FieldLabel>
      <OTPInput name="code" required>
        <OTPInputGroup>
          {#each [0, 1, 2, 3, 4, 5] as index (index)}
            <OTPInputSlot {index} />
          {/each}
        </OTPInputGroup>
      </OTPInput>
      <FieldDescription
        >Enter the six-digit code we sent to hollis@example.com.</FieldDescription
      >
      <FieldError />
    </Field>
  </form>
  <Field>
    <FieldLabel>Recovery code (optional)</FieldLabel>
    <OTPInput
      name="recovery"
      form="verify-sign-in"
      maxLength={8}
      pattern="alphanumeric"
    >
      <OTPInputGroup>
        {#each [0, 1, 2, 3, 4, 5, 6, 7] as index (index)}
          <OTPInputSlot {index} />
        {/each}
      </OTPInputGroup>
    </OTPInput>
    <FieldError />
  </Field>
  <div data-slot="row">
    <button type="reset" form="verify-sign-in">Reset</button>
    <button type="submit" form="verify-sign-in" data-variant="solid"
      >Verify</button
    >
  </div>
</div>
