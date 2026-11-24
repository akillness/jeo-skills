import { Checkbox, CheckboxIndicator } from "@ui-sdk/react/checkbox"
import { CheckIcon } from "lucide-react"

export function Example() {
  return (
    <div data-slot="stack" dir="rtl">
      <label data-slot="label">
        <Checkbox>
          <CheckboxIndicator>
            <CheckIcon />
          </CheckboxIndicator>
        </Checkbox>
        قبول الشروط والأحكام
      </label>
      <label data-slot="label">
        <Checkbox defaultChecked>
          <CheckboxIndicator>
            <CheckIcon />
          </CheckboxIndicator>
        </Checkbox>
        تفعيل الإشعارات
      </label>
    </div>
  )
}
