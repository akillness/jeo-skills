import {
  Field,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@ui-sdk/react/field"
import { Input } from "@ui-sdk/react/input"

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
