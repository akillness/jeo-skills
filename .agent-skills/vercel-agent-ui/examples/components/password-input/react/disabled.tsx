import { Field, FieldDescription, FieldLabel } from "@ui-sdk/react/field"
import {
  PasswordInput,
  PasswordInputControl,
  PasswordInputToggle,
} from "@ui-sdk/react/password-input"
import { EyeIcon, EyeOffIcon } from "lucide-react"

function Example() {
  return (
    <Field disabled name="password">
      <FieldLabel>Password</FieldLabel>
      <PasswordInput defaultValue="hunter22">
        <PasswordInputControl />
        <PasswordInputToggle aria-label="Show password">
          {(state) =>
            state.visible ? (
              <EyeOffIcon aria-hidden="true" />
            ) : (
              <EyeIcon aria-hidden="true" />
            )
          }
        </PasswordInputToggle>
      </PasswordInput>
      <FieldDescription>
        Your administrator manages this password.
      </FieldDescription>
    </Field>
  )
}

export { Example }
