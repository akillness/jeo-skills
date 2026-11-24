import { Field, FieldDescription, FieldLabel } from "@ui-sdk/react/field"
import { Input, InputClear, InputGroup } from "@ui-sdk/react/input"
import { XIcon } from "lucide-react"

function Example() {
  return (
    <div data-slot="stack" dir="rtl">
      <Field name="name">
        <FieldLabel>الاسم الكامل</FieldLabel>
        <Input placeholder="ليلى حسن" />
        <FieldDescription>كما يظهر في ملفك الشخصي.</FieldDescription>
      </Field>
      <InputGroup>
        <Input type="search" aria-label="بحث" defaultValue="حسن" />
        <InputClear aria-label="مسح البحث">
          <XIcon aria-hidden="true" />
        </InputClear>
      </InputGroup>
    </div>
  )
}

export { Example }
