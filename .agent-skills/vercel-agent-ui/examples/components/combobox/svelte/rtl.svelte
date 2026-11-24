<script lang="ts">
  import { CheckIcon, ChevronDownIcon } from "@lucide/svelte"
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
  } from "@ui-sdk/svelte/combobox"

  const cities = [
    { value: "cairo", label: "القاهرة" },
    { value: "dubai", label: "دبي" },
    { value: "riyadh", label: "الرياض" },
    { value: "beirut", label: "بيروت" },
    { value: "amman", label: "عمّان" },
    { value: "rabat", label: "الرباط" },
  ]
</script>

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
        {#each cities as city (city.value)}
          <ComboboxItem value={city.value} label={city.label}>
            {city.label}
            <ComboboxItemIndicator>
              <CheckIcon />
            </ComboboxItemIndicator>
          </ComboboxItem>
        {/each}
      </ComboboxList>
    </ComboboxContent>
  </Combobox>
</div>
