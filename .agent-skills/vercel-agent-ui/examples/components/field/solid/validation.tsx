import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@ui-sdk/solid/field"
import { Input } from "@ui-sdk/solid/input"
import { useLog } from "../../../shared/solid/log"

function Example() {
  const log = useLog()

  return (
    <form
      data-slot="stack"
      onSubmit={(event) => {
        event.preventDefault()
        log(`Subscribed ${new FormData(event.currentTarget).get("email")}`)
      }}
    >
      <Field name="email">
        <FieldLabel>Email</FieldLabel>
        <Input type="email" required placeholder="hollis@example.com" />
        <FieldDescription
          render={(props, state) => (
            <p {...props}>
              {state.valid
                ? "Looks good."
                : "We'll send you a confirmation link."}
            </p>
          )}
        />
        <FieldError match="valueMissing">Enter your email address.</FieldError>
        <FieldError match="typeMismatch">
          Enter an email address like hollis@example.com.
        </FieldError>
      </Field>
      <Field name="website">
        <FieldLabel>Website</FieldLabel>
        <Input type="url" required placeholder="https://example.com" />
        <FieldError />
      </Field>
      <button type="submit" data-variant="solid">
        Subscribe
      </button>
    </form>
  )
}

export { Example }
