import { Field, FieldLabel } from "@ui-sdk/react/field"
import {
  PasswordInput,
  PasswordInputControl,
  PasswordInputToggle,
} from "@ui-sdk/react/password-input"
import { EyeIcon, EyeOffIcon } from "lucide-react"
import * as React from "react"
import { useLog } from "../../../shared/react/log"

function Example() {
  const log = useLog()
  const [visible, setVisible] = React.useState(false)
  return (
    <Field name="password">
      <FieldLabel>Password</FieldLabel>
      <PasswordInput
        visible={visible}
        onVisibleChange={(next, details) => {
          setVisible(next)
          log(`${next ? "Shown" : "Hidden"} (${details.reason})`)
        }}
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
    </Field>
  )
}

export { Example }
