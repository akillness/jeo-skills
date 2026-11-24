import { Field, FieldDescription, FieldLabel } from "@ui-sdk/react/field"
import {
  PasswordInput,
  PasswordInputControl,
  PasswordInputToggle,
} from "@ui-sdk/react/password-input"
import { EyeIcon, EyeOffIcon } from "lucide-react"

function Example() {
  return (
    <Field name="recovery-key">
      <FieldLabel>Recovery key</FieldLabel>
      <PasswordInput readOnly defaultValue="7Hq2-vX9p-Lm4c" autoComplete="off">
        <PasswordInputControl />
        <PasswordInputToggle aria-label="Show recovery key">
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
        Keep it somewhere safe. You can show it, but not change it.
      </FieldDescription>
    </Field>
  )
}

export { Example }
