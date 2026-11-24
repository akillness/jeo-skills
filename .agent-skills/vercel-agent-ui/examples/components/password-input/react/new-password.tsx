import { Field, FieldLabel } from "@ui-sdk/react/field"
import {
  PasswordInput,
  PasswordInputControl,
  PasswordInputToggle,
} from "@ui-sdk/react/password-input"
import { CheckIcon, EyeIcon, EyeOffIcon, XIcon } from "lucide-react"
import * as React from "react"

const rules = [
  {
    label: "At least 8 characters",
    test: (password: string) => password.length >= 8,
  },
  { label: "A number", test: (password: string) => /\d/.test(password) },
  {
    label: "An uppercase and a lowercase letter",
    test: (password: string) =>
      /[a-z]/.test(password) && /[A-Z]/.test(password),
  },
]

function Example() {
  const [password, setPassword] = React.useState("")
  return (
    <Field name="new-password">
      <FieldLabel>Create a password</FieldLabel>
      <PasswordInput
        value={password}
        autoComplete="new-password"
        onValueChange={(value) => setPassword(value)}
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
      <ul data-slot="stack" aria-label="Password requirements">
        {rules.map((rule) =>
          rule.test(password) ? (
            <li data-slot="row" key={rule.label}>
              <CheckIcon aria-hidden="true" />
              <span data-slot="visually-hidden">Done:</span>
              {rule.label}
            </li>
          ) : (
            <li data-slot="row" key={rule.label}>
              <XIcon aria-hidden="true" />
              <span data-slot="visually-hidden">To do:</span>
              {rule.label}
            </li>
          )
        )}
      </ul>
    </Field>
  )
}

export { Example }
