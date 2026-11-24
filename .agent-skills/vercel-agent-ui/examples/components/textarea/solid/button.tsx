import { Field, FieldLabel } from "@ui-sdk/solid/field"
import { Textarea, createInputController } from "@ui-sdk/solid/textarea"
import { useLog } from "../../../shared/solid/log"

function Example() {
  const log = useLog()
  const message = createInputController()
  return (
    <form
      data-slot="stack"
      onSubmit={(event) => {
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
        <button type="submit" data-variant="solid">
          Send Message
        </button>
      </div>
    </form>
  )
}

export { Example }
