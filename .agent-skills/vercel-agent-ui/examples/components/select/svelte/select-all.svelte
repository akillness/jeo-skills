<script lang="ts">
  import { CheckIcon, ChevronDownIcon, MinusIcon } from "@lucide/svelte"
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectItemIndicator,
    SelectSelectAll,
    SelectSeparator,
    SelectTrigger,
    SelectValue,
  } from "@ui-sdk/svelte/select"

  const regions = [
    { value: "us-east", label: "US East" },
    { value: "us-west", label: "US West" },
    { value: "europe", label: "Europe" },
    { value: "asia-pacific", label: "Asia Pacific" },
    { value: "south-america", label: "South America" },
  ]
</script>

<Field>
  <FieldLabel>Regions</FieldLabel>
  <Select
    multiple
    defaultValue={["us-east", "europe", "asia-pacific"]}
    placeholder="Select regions"
  >
    <SelectTrigger>
      <SelectValue maxLabels={2} getMoreLabel={(count) => `${count} more`} />
      <ChevronDownIcon />
    </SelectTrigger>
    <SelectContent>
      <SelectSelectAll>
        {#snippet children(state)}
          Select all
          {#if state.checked}
            <CheckIcon />
          {/if}
          {#if state.indeterminate}
            <MinusIcon />
          {/if}
        {/snippet}
      </SelectSelectAll>
      <SelectSeparator />
      {#each regions as region (region.value)}
        <SelectItem value={region.value}>
          {region.label}
          <SelectItemIndicator>
            <CheckIcon />
          </SelectItemIndicator>
        </SelectItem>
      {/each}
    </SelectContent>
  </Select>
</Field>
