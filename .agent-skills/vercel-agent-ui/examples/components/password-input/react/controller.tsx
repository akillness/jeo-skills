import { Field, FieldLabel } from "@ui-sdk/react/field"
import {
  createPasswordInputController,
  PasswordInput,
  PasswordInputControl,
  PasswordInputToggle,
} from "@ui-sdk/react/password-input"
import { EyeIcon, EyeOffIcon } from "lucide-react"
import * as React from "react"
import { useLog } from "../../../shared/react/log"

function Example() {
  const log = useLog()
  const [password] = React.useState(createPasswordInputController)
  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <button
          type="button"
          onClick={() => {
            password.setValue("plum-kettle-orbit-42")
            password.setVisible(true)
          }}
        >
          Suggest
        </button>
        <button type="button" onClick={() => password.toggleVisible()}>
          Toggle
        </button>
        <button type="button" onClick={() => password.clear()}>
          Clear
        </button>
        <button
          type="button"
          onClick={() =>
            log(
              `${password.getValue().length} characters, ${password.isVisible() ? "shown" : "hidden"}`
            )
          }
        >
          Read
        </button>
        <button type="button" onClick={() => password.focus()}>
          Focus
        </button>
      </div>
      <Field name="new-password">
        <FieldLabel>New password</FieldLabel>
        <PasswordInput controller={password} autoComplete="new-password">
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
      </Field>
    </div>
  )
}

export { Example }
