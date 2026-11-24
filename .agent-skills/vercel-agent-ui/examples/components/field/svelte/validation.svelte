<script lang="ts">
  import {
    Field,
    FieldDescription,
    FieldError,
    FieldLabel,
  } from "@ui-sdk/svelte/field"
  import { Input } from "@ui-sdk/svelte/input"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()

  function submit(event: SubmitEvent) {
    event.preventDefault()
    log(
      `Subscribed ${new FormData(event.currentTarget as HTMLFormElement).get("email")}`
    )
  }
</script>

<form data-slot="stack" onsubmit={submit}>
  <Field name="email">
    <FieldLabel>Email</FieldLabel>
    <Input type="email" required placeholder="hollis@example.com" />
    <FieldDescription>
      {#snippet children(state)}
        {state.valid ? "Looks good." : "We'll send you a confirmation link."}
      {/snippet}
    </FieldDescription>
    <FieldError match="valueMissing">Enter your email address.</FieldError>
    <FieldError match="typeMismatch"
      >Enter an email address like hollis@example.com.</FieldError
    >
  </Field>
  <Field name="website">
    <FieldLabel>Website</FieldLabel>
    <Input type="url" required placeholder="https://example.com" />
    <FieldError />
  </Field>
  <button type="submit" data-variant="solid">Subscribe</button>
</form>
