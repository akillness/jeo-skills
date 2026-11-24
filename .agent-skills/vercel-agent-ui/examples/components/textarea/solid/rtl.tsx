import { Field, FieldDescription, FieldLabel } from "@ui-sdk/solid/field"
import { Textarea } from "@ui-sdk/solid/textarea"

function Example() {
  return (
    <Field dir="rtl" name="feedback">
      <FieldLabel>ملاحظاتك</FieldLabel>
      <Textarea autoResize placeholder="أخبرنا برأيك…" />
      <FieldDescription>نقرأ كل رسالة.</FieldDescription>
    </Field>
  )
}

export { Example }
