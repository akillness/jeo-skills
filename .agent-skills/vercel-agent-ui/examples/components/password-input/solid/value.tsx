import { Field, FieldLabel } from "@ui-sdk/solid/field"
import {
  PasswordInput,
  PasswordInputControl,
  PasswordInputToggle,
} from "@ui-sdk/solid/password-input"
import { createSignal, For } from "solid-js"

function strength(password: string) {
  return [
    password.length >= 8,
    password.length >= 12,
    /[a-z]/.test(password) && /[A-Z]/.test(password),
    /\d/.test(password) && /[^a-zA-Z\d]/.test(password),
  ].filter(Boolean).length
}

function Example() {
  const [value, setValue] = createSignal("")
  const score = () => strength(value())
  return (
    <Field name="new-password">
      <FieldLabel>New password</FieldLabel>
      <PasswordInput
        value={value()}
        onValueChange={(next) => setValue(next)}
        autoComplete="new-password"
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
      <div data-slot="strength" aria-hidden="true">
        <For each={[1, 2, 3, 4]}>
          {(level) => <div data-on={score() >= level || undefined} />}
        </For>
      </div>
      <output data-slot="output">
        {value()
          ? `Strength: ${["Weak", "Weak", "Fair", "Good", "Strong"][score()]} (${value().length} characters)`
          : "Type a password to rate it."}
      </output>
    </Field>
  )
}

export { Example }
