import { Field, FieldLabel } from "@ui-sdk/solid/field"
import {
  PasswordInput,
  PasswordInputControl,
  PasswordInputToggle,
} from "@ui-sdk/solid/password-input"
import { createSignal, For } from "solid-js"

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
  const [password, setPassword] = createSignal("")
  return (
    <Field name="new-password">
      <FieldLabel>Create a password</FieldLabel>
      <PasswordInput
        value={password()}
        autoComplete="new-password"
        onValueChange={(value) => setPassword(value)}
      >
        <PasswordInputControl />
        <PasswordInputToggle aria-label="Show password">
          {(state) =>
            state.visible ? (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
                <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
                <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
                <path d="m2 2 20 20" />
              </svg>
            ) : (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )
          }
        </PasswordInputToggle>
      </PasswordInput>
      <ul data-slot="stack" aria-label="Password requirements">
        <For each={rules}>
          {(rule) => (
            <>
              {rule.test(password()) ? (
                <li data-slot="row">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  <span data-slot="visually-hidden">Done:</span>
                  {rule.label}
                </li>
              ) : (
                <li data-slot="row">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                  <span data-slot="visually-hidden">To do:</span>
                  {rule.label}
                </li>
              )}
            </>
          )}
        </For>
      </ul>
    </Field>
  )
}

export { Example }
