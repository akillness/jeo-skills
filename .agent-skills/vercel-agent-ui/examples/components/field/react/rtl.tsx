import { Checkbox, CheckboxIndicator } from "@ui-sdk/react/checkbox"
import { Field, FieldDescription, FieldLabel } from "@ui-sdk/react/field"
import { Input } from "@ui-sdk/react/input"
import { CheckIcon } from "lucide-react"

function Example() {
  return (
    <div data-slot="stack" dir="rtl">
      <Field>
        <FieldLabel>الاسم على البطاقة</FieldLabel>
        <Input name="card-name" autoComplete="cc-name" placeholder="ليلى حسن" />
      </Field>
      <Field>
        <FieldLabel>رقم البطاقة</FieldLabel>
        <Input
          name="card-number"
          inputMode="numeric"
          autoComplete="cc-number"
          placeholder="1234 5678 9012 3456"
        />
        <FieldDescription>أدخل الرقم المكون من 16 خانة.</FieldDescription>
      </Field>
      <Field>
        <Checkbox name="save-card" defaultChecked>
          <CheckboxIndicator>
            <CheckIcon />
          </CheckboxIndicator>
        </Checkbox>
        <FieldLabel>احفظ البطاقة للمدفوعات القادمة</FieldLabel>
      </Field>
    </div>
  )
}

export { Example }
