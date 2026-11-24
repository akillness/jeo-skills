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
    SelectTrigger,
    SelectValue,
    type ListData,
  } from "@ui-sdk/svelte/select"

  const sizeGroups = [
    { type: "group", label: "Common", items: ["Small", "Medium", "Large"] },
    { type: "group", label: "Extended", items: ["Extra small", "Extra large"] },
  ] satisfies ListData
</script>

<Field>
  <FieldLabel>Size</FieldLabel>
  <Select items={sizeGroups} name="size" defaultValue="Medium">
    <SelectTrigger>
      <SelectValue />
      <ChevronDownIcon />
    </SelectTrigger>
    <SelectContent>
      {#each sizeGroups as group (group.label)}
        <SelectGroup>
          <SelectGroupLabel>{group.label}</SelectGroupLabel>
          {#each group.items as size (size)}
            <SelectItem value={size}>
              {size}
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
