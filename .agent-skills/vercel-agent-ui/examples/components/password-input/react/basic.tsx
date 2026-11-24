import { Field, FieldDescription, FieldLabel } from "@ui-sdk/react/field"
import {
  PasswordInput,
  PasswordInputControl,
  PasswordInputToggle,
} from "@ui-sdk/react/password-input"
import { EyeIcon, EyeOffIcon } from "lucide-react"

function Example() {
  return (
    <Field name="password">
      <FieldLabel>Password</FieldLabel>
      <PasswordInput>
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
      <FieldDescription>Use at least 8 characters.</FieldDescription>
    </Field>
  )
}

export { Example }
