import {
  Field,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@ui-sdk/solid/field"
import { Input } from "@ui-sdk/solid/input"

function Example() {
  return (
    <FieldSet dir="rtl">
      <FieldLegend>العنوان</FieldLegend>
      <FieldDescription>نحتاج عنوانك لتوصيل طلبك.</FieldDescription>
      <Field name="street">
        <FieldLabel>الشارع</FieldLabel>
        <Input />
      </Field>
      <Field name="city">
        <FieldLabel>المدينة</FieldLabel>
        <Input />
      </Field>
    </FieldSet>
  )
}

export { Example }
