import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@ui-sdk/react/command"

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
          {commands.map((item) => (
            <CommandItem key={item.value} value={item.value} label={item.label}>
              {item.label}
            </CommandItem>
          ))}
        </CommandList>
      </Command>
    </div>
  )
}
