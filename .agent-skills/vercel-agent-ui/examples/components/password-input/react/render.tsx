import { Field, FieldLabel } from "@ui-sdk/react/field"
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
        <PasswordInputToggle
          aria-label="Show password"
          render={(props, state) => (
            <button {...props}>
              {state.visible ? (
                <EyeOffIcon aria-hidden="true" />
              ) : (
                <EyeIcon aria-hidden="true" />
              )}
            </button>
          )}
        />
      </PasswordInput>
    </Field>
  )
}

export { Example }
