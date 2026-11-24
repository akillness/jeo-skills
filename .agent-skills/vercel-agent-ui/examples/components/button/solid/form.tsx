import { Button } from "@ui-sdk/solid/button"
import { Field, FieldLabel } from "@ui-sdk/solid/field"
import { Input } from "@ui-sdk/solid/input"
import { useLog } from "../../../shared/solid/log"

function Example() {
  const log = useLog()

  return (
    <form
      data-slot="stack"
      onSubmit={(event) => {
        event.preventDefault()
        const email = String(new FormData(event.currentTarget).get("email"))
        log(`Subscribed ${email}`)
      }}
    >
      <Field>
        <FieldLabel>Email</FieldLabel>
        <Input name="email" type="email" defaultValue="ada@example.com" />
      </Field>
      <div data-slot="row">
        <Button type="submit">Subscribe</Button>
        <Button type="reset">Reset</Button>
      </div>
    </form>
  )
}

export { Example }
