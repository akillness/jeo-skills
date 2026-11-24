<script lang="ts">
  import {
    Command,
    CommandEmpty,
    CommandInput,
    CommandItem,
    CommandList,
  } from "@ui-sdk/svelte/command"

  const commands = [
    { value: "calendar", label: "التقويم" },
    { value: "search", label: "البحث" },
    { value: "settings", label: "الإعدادات" },
    { value: "profile", label: "الملف الشخصي" },
  ]
</script>

<div dir="rtl" data-slot="stack">
  <Command>
    <CommandInput aria-label="ابحث عن أمر" placeholder="ابحث…" />
    <CommandEmpty>لا توجد نتائج.</CommandEmpty>
    <CommandList>
      {#each commands as item (item.value)}
        <CommandItem value={item.value} label={item.label}>
          {item.label}
        </CommandItem>
      {/each}
    </CommandList>
  </Command>
</div>
