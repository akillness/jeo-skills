<script lang="ts">
  import { CheckIcon, ChevronDownIcon } from "@lucide/svelte"
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectItemIndicator,
    SelectTrigger,
    SelectValue,
  } from "@ui-sdk/svelte/select"

  const languages = [
    { value: "ar", label: "العربية" },
    { value: "en", label: "الإنجليزية" },
    { value: "fr", label: "الفرنسية" },
    { value: "es", label: "الإسبانية" },
    { value: "de", label: "الألمانية" },
  ]
</script>

<div dir="rtl">
  <Field>
    <FieldLabel>اللغة</FieldLabel>
    <Select placeholder="اختر لغة">
      <SelectTrigger>
        <SelectValue />
        <ChevronDownIcon />
      </SelectTrigger>
      <SelectContent>
        {#each languages as language (language.value)}
          <SelectItem value={language.value}>
            {language.label}
            <SelectItemIndicator>
              <CheckIcon />
            </SelectItemIndicator>
          </SelectItem>
        {/each}
      </SelectContent>
    </Select>
  </Field>
</div>
