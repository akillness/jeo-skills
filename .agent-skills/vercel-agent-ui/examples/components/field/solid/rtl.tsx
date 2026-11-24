import { Checkbox, CheckboxIndicator } from "@ui-sdk/solid/checkbox"
import { Field, FieldDescription, FieldLabel } from "@ui-sdk/solid/field"
import { Input } from "@ui-sdk/solid/input"

function Example() {
  return (
    <div data-slot="stack" dir="rtl">
      <Field>
        <FieldLabel>الاسم على البطاقة</FieldLabel>
        <Input name="card-name" autocomplete="cc-name" placeholder="ليلى حسن" />
      </Field>
      <Field>
        <FieldLabel>رقم البطاقة</FieldLabel>
        <Input
          name="card-number"
          inputmode="numeric"
          autocomplete="cc-number"
          placeholder="1234 5678 9012 3456"
        />
        <FieldDescription>أدخل الرقم المكون من 16 خانة.</FieldDescription>
      </Field>
      <Field>
        <Checkbox name="save-card" defaultChecked>
          <CheckboxIndicator>
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
          </CheckboxIndicator>
        </Checkbox>
        <FieldLabel>احفظ البطاقة للمدفوعات القادمة</FieldLabel>
      </Field>
    </div>
  )
}

export { Example }
