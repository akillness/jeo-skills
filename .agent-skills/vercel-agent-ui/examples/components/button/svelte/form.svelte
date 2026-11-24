<script lang="ts">
  import { Button } from "@ui-sdk/svelte/button"
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import { Input } from "@ui-sdk/svelte/input"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()

  function onSubmit(event: SubmitEvent) {
    event.preventDefault()
    const email = String(
      new FormData(event.currentTarget as HTMLFormElement).get("email")
    )
    log(`Subscribed ${email}`)
  }
</script>

<form data-slot="stack" onsubmit={onSubmit}>
  <Field>
    <FieldLabel>Email</FieldLabel>
    <Input name="email" type="email" defaultValue="ada@example.com" />
  </Field>
  <div data-slot="row">
    <Button type="submit">Subscribe</Button>
    <Button type="reset">Reset</Button>
  </div>
</form>
