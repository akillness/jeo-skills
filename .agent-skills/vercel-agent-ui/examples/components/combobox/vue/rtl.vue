<script setup lang="ts">
import { CheckIcon, ChevronDownIcon } from "@lucide/vue"
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxLabel,
  ComboboxList,
  ComboboxTrigger,
} from "@ui-sdk/vue/combobox"

const cities = [
  { value: "cairo", label: "القاهرة" },
  { value: "dubai", label: "دبي" },
  { value: "riyadh", label: "الرياض" },
  { value: "beirut", label: "بيروت" },
  { value: "amman", label: "عمّان" },
  { value: "rabat", label: "الرباط" },
]
</script>

<template>
  <div dir="rtl">
    <Combobox>
      <div data-slot="stack">
        <ComboboxLabel>المدينة</ComboboxLabel>
        <div data-slot="row">
          <ComboboxInput placeholder="ابحث عن مدينة…" />
          <ComboboxTrigger aria-label="عرض المدن">
            <ChevronDownIcon />
          </ComboboxTrigger>
        </div>
      </div>
      <ComboboxContent>
        <ComboboxEmpty>لا توجد نتائج.</ComboboxEmpty>
        <ComboboxList>
          <ComboboxItem
            v-for="city in cities"
            :key="city.value"
            :value="city.value"
            :label="city.label"
          >
            {{ city.label }}
            <ComboboxItemIndicator>
              <CheckIcon />
            </ComboboxItemIndicator>
          </ComboboxItem>
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  </div>
</template>
