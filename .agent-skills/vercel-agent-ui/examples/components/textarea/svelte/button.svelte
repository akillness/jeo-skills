<script lang="ts">
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import { Textarea, createInputController } from "@ui-sdk/svelte/textarea"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()
  const message = createInputController()
</script>

<form
  data-slot="stack"
  onsubmit={(event) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    log(`Sent “${data.get("message")}”`)
    message.clear()
  }}
>
  <Field name="message">
    <FieldLabel>Message</FieldLabel>
    <Textarea
      controller={message}
      required
      placeholder="Write a reply to Hollis Grant…"
    />
  </Field>
  <div data-slot="row">
    <button type="submit" data-variant="solid">Send Message</button>
  </div>
</form>
