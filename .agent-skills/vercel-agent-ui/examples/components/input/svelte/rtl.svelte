<script lang="ts">
  import { XIcon } from "@lucide/svelte"
  import { Field, FieldDescription, FieldLabel } from "@ui-sdk/svelte/field"
  import { Input, InputClear, InputGroup } from "@ui-sdk/svelte/input"
</script>

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
