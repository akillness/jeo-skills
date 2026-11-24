import { Field, FieldDescription, FieldLabel } from "@ui-sdk/react/field"
import {
  PasswordInput,
  PasswordInputControl,
  PasswordInputToggle,
} from "@ui-sdk/react/password-input"
import { EyeIcon, EyeOffIcon } from "lucide-react"

function Example() {
  return (
    <div dir="rtl">
      <Field name="password">
        <FieldLabel>كلمة المرور</FieldLabel>
        <PasswordInput>
          <PasswordInputControl />
          <PasswordInputToggle aria-label="إظهار كلمة المرور">
            {(state) =>
              state.visible ? (
                <EyeOffIcon aria-hidden="true" />
              ) : (
                <EyeIcon aria-hidden="true" />
              )
            }
          </PasswordInputToggle>
        </PasswordInput>
        <FieldDescription>ثمانية أحرف على الأقل.</FieldDescription>
      </Field>
    </div>
  )
}

export { Example }
