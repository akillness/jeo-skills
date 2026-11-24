<script lang="ts">
  import { CheckIcon } from "@lucide/svelte"
  import {
    Checkbox,
    CheckboxGroup,
    CheckboxIndicator,
  } from "@ui-sdk/svelte/checkbox"
  import {
    Field,
    FieldDescription,
    FieldError,
    FieldLabel,
  } from "@ui-sdk/svelte/field"
  import { useLog } from "../../../shared/svelte/log"

  const channels = [
    { value: "email", label: "Email" },
    { value: "sms", label: "SMS" },
    { value: "push", label: "Push notifications" },
  ]

  const log = useLog()

  function onSubmit(event: SubmitEvent & { currentTarget: HTMLFormElement }) {
    event.preventDefault()
    const entries = [...new FormData(event.currentTarget)].map(
      ([name, value]) => `${name}=${value}`
    )
    log(`Saved ${entries.join("&")}`)
  }
</script>

<form data-slot="stack" onsubmit={onSubmit}>
  <Field>
    <FieldLabel>Notifications</FieldLabel>
    <FieldDescription
      >Choose how we tell you about your orders.</FieldDescription
    >
    <CheckboxGroup name="notifications" required>
      {#each channels as channel (channel.value)}
        <label data-slot="label">
          <Checkbox value={channel.value}>
            <CheckboxIndicator>
              <CheckIcon aria-hidden="true" />
            </CheckboxIndicator>
          </Checkbox>
          {channel.label}
        </label>
      {/each}
    </CheckboxGroup>
    <div>
      <FieldError>Choose at least one way to be notified.</FieldError>
    </div>
  </Field>
  <button type="submit">Save</button>
</form>
