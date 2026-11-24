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
} from "@ui-sdk/solid/combobox"
import { For } from "solid-js"

const cities = [
  { value: "cairo", label: "القاهرة" },
  { value: "dubai", label: "دبي" },
  { value: "riyadh", label: "الرياض" },
  { value: "beirut", label: "بيروت" },
  { value: "amman", label: "عمّان" },
  { value: "rabat", label: "الرباط" },
]

export function Example() {
  return (
    <div dir="rtl">
      <Combobox>
        <div data-slot="stack">
          <ComboboxLabel>المدينة</ComboboxLabel>
          <div data-slot="row">
            <ComboboxInput placeholder="ابحث عن مدينة…" />
            <ComboboxTrigger aria-label="عرض المدن">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </ComboboxTrigger>
          </div>
        </div>
        <ComboboxContent>
          <ComboboxEmpty>لا توجد نتائج.</ComboboxEmpty>
          <ComboboxList>
            <For each={cities}>
              {(city) => (
                <ComboboxItem value={city.value} label={city.label}>
                  {city.label}
                  <ComboboxItemIndicator>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </ComboboxItemIndicator>
                </ComboboxItem>
              )}
            </For>
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  )
}
