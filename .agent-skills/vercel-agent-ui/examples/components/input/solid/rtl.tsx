import { Field, FieldDescription, FieldLabel } from "@ui-sdk/solid/field"
import { Input, InputClear, InputGroup } from "@ui-sdk/solid/input"

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
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </InputClear>
      </InputGroup>
    </div>
  )
}

export { Example }
