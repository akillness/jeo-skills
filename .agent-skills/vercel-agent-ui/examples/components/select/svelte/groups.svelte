<script lang="ts">
  import { CheckIcon, ChevronDownIcon } from "@lucide/svelte"
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import {
    Select,
    SelectContent,
    SelectGroup,
    SelectGroupLabel,
    SelectItem,
    SelectItemIndicator,
    SelectSeparator,
    SelectTrigger,
    SelectValue,
  } from "@ui-sdk/svelte/select"

  const fonts = [
    {
      label: "Sans serif",
      items: [
        { value: "inter", label: "Inter" },
        { value: "geist", label: "Geist" },
      ],
    },
    {
      label: "Serif",
      items: [
        { value: "source-serif", label: "Source Serif" },
        { value: "lora", label: "Lora" },
      ],
    },
    {
      label: "Monospace",
      items: [
        { value: "geist-mono", label: "Geist Mono" },
        { value: "jetbrains-mono", label: "JetBrains Mono" },
      ],
    },
  ]
</script>

<Field>
  <FieldLabel>Font</FieldLabel>
  <Select placeholder="Select a font">
    <SelectTrigger>
      <SelectValue />
      <ChevronDownIcon />
    </SelectTrigger>
    <SelectContent>
      {#each fonts as group, index (group.label)}
        {#if index > 0}
          <SelectSeparator />
        {/if}
        <SelectGroup>
          <SelectGroupLabel>{group.label}</SelectGroupLabel>
          {#each group.items as item (item.value)}
            <SelectItem value={item.value}>
              {item.label}
              <SelectItemIndicator>
                <CheckIcon />
              </SelectItemIndicator>
            </SelectItem>
          {/each}
        </SelectGroup>
      {/each}
    </SelectContent>
  </Select>
</Field>
