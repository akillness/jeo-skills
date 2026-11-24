import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@ui-sdk/solid/command"
import { For } from "solid-js"

const commands = [
  { value: "calendar", label: "التقويم" },
  { value: "search", label: "البحث" },
  { value: "settings", label: "الإعدادات" },
  { value: "profile", label: "الملف الشخصي" },
]

export function Example() {
  return (
    <div dir="rtl" data-slot="stack">
      <Command>
        <CommandInput aria-label="ابحث عن أمر" placeholder="ابحث…" />
        <CommandEmpty>لا توجد نتائج.</CommandEmpty>
        <CommandList>
          <For each={commands}>
            {(item) => (
              <CommandItem value={item.value} label={item.label}>
                {item.label}
              </CommandItem>
            )}
          </For>
        </CommandList>
      </Command>
    </div>
  )
}
