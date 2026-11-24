import { Field, FieldLabel } from "@ui-sdk/react/field"
import {
  PasswordInput,
  PasswordInputControl,
  PasswordInputToggle,
} from "@ui-sdk/react/password-input"
import { EyeIcon, EyeOffIcon, LockIcon } from "lucide-react"

function Example() {
  return (
    <Field name="password">
      <FieldLabel>Password</FieldLabel>
      <PasswordInput>
        {(state) => (
          <>
            <PasswordInputControl />
            <span>{state.capsLock && <LockIcon aria-hidden="true" />}</span>
            <PasswordInputToggle aria-label="Show password">
              {(toggle) =>
                toggle.visible ? (
                  <EyeOffIcon aria-hidden="true" />
                ) : (
                  <EyeIcon aria-hidden="true" />
                )
              }
            </PasswordInputToggle>
          </>
        )}
      </PasswordInput>
      <p data-slot="caps-lock">Caps Lock is on.</p>
    </Field>
  )
}

export { Example }
