import { Field, FieldLabel } from "@ui-sdk/react/field"
import {
  PasswordInput,
  PasswordInputControl,
  PasswordInputToggle,
} from "@ui-sdk/react/password-input"
import { EyeIcon, EyeOffIcon } from "lucide-react"
import * as React from "react"

function strength(password: string) {
  return [
    password.length >= 8,
    password.length >= 12,
    /[a-z]/.test(password) && /[A-Z]/.test(password),
    /\d/.test(password) && /[^a-zA-Z\d]/.test(password),
  ].filter(Boolean).length
}

function Example() {
  const [value, setValue] = React.useState("")
  const score = strength(value)
  return (
    <Field name="new-password">
      <FieldLabel>New password</FieldLabel>
      <PasswordInput
        value={value}
        onValueChange={(next) => setValue(next)}
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
      <div data-slot="strength" aria-hidden="true">
        {[1, 2, 3, 4].map((level) => (
          <div key={level} data-on={score >= level || undefined} />
        ))}
      </div>
      <output data-slot="output">
        {value
          ? `Strength: ${["Weak", "Weak", "Fair", "Good", "Strong"][score]} (${value.length} characters)`
          : "Type a password to rate it."}
      </output>
    </Field>
  )
}

export { Example }
