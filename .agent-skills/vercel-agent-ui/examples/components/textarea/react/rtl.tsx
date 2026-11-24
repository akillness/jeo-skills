import { Field, FieldDescription, FieldLabel } from "@ui-sdk/react/field"
import { Textarea } from "@ui-sdk/react/textarea"

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
