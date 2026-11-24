import { Field, FieldDescription, FieldLabel } from "@ui-sdk/react/field"
import {
  PasswordInput,
  PasswordInputControl,
  PasswordInputToggle,
} from "@ui-sdk/react/password-input"
import { EyeIcon, EyeOffIcon } from "lucide-react"

function Example() {
  return (
    <Field name="wifi-password">
      <FieldLabel>Wi-Fi password</FieldLabel>
      <PasswordInput
        defaultVisible
        defaultValue="maple-orbit-42"
        autoComplete="new-password"
      >
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
        Guests read it from here, so it starts shown.
      </FieldDescription>
    </Field>
  )
}

export { Example }
