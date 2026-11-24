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

  const sizes = ["Extra small", "Small", "Medium", "Large", "Extra large"]

  const wraps = ["Paper", "Ribbon", "Box"]
</script>

<div data-slot="stack">
  <Field>
    <FieldLabel>Size</FieldLabel>
    <Select placeholder="Select a size">
      <SelectTrigger>
        <SelectValue />
        <ChevronDownIcon />
      </SelectTrigger>
      <SelectContent>
        {#each sizes as size (size)}
          <SelectItem value={size}>
            {size}
            <SelectItemIndicator>
              <CheckIcon />
            </SelectItemIndicator>
          </SelectItem>
        {/each}
      </SelectContent>
    </Select>
  </Field>
  <Field>
    <FieldLabel>Gift wrap</FieldLabel>
    <Select>
      <SelectTrigger>
        <SelectValue placeholder="None" />
        <ChevronDownIcon />
      </SelectTrigger>
      <SelectContent>
        {#each wraps as wrap (wrap)}
          <SelectItem value={wrap}>
            {wrap}
            <SelectItemIndicator>
              <CheckIcon />
            </SelectItemIndicator>
          </SelectItem>
        {/each}
      </SelectContent>
    </Select>
  </Field>
</div>
