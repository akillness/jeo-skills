<script lang="ts">
  import {
    Field,
    FieldDescription,
    FieldError,
    FieldLabel,
  } from "@ui-sdk/svelte/field"
  import { Radio, RadioGroup, RadioIndicator } from "@ui-sdk/svelte/radio"
  import { useLog } from "../../../shared/svelte/log"

  const channels = [
    { value: "email", label: "Email only" },
    { value: "sms", label: "SMS only" },
    { value: "both", label: "Email and SMS" },
  ]

  const log = useLog()

  function onSubmit(event: SubmitEvent & { currentTarget: HTMLFormElement }) {
    event.preventDefault()
    log(`Saved updates=${new FormData(event.currentTarget).get("updates")}`)
  }
</script>

<form data-slot="stack" onsubmit={onSubmit}>
  <Field>
    <FieldLabel>Order updates</FieldLabel>
    <FieldDescription
      >Choose how we tell you about your orders.</FieldDescription
    >
    <RadioGroup name="updates" required>
      {#each channels as channel (channel.value)}
        <label data-slot="label">
          <Radio value={channel.value}>
            <RadioIndicator />
          </Radio>
          {channel.label}
        </label>
      {/each}
    </RadioGroup>
    <FieldError>Choose how to get order updates.</FieldError>
  </Field>
  <div data-slot="row">
    <button type="submit" data-variant="solid">Save</button>
  </div>
</form>
