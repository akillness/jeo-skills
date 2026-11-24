<script lang="ts">
  import { CheckIcon, ChevronDownIcon } from "@lucide/svelte"
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import {
    Select,
    SelectContent,
    SelectEmpty,
    SelectGroup,
    SelectGroupLabel,
    SelectInput,
    SelectItem,
    SelectItemIndicator,
    SelectItemText,
    SelectList,
    SelectTrigger,
    SelectValue,
  } from "@ui-sdk/svelte/select"

  const regions = [
    {
      label: "Americas",
      items: [
        { value: "br", label: "Brazil" },
        { value: "ca", label: "Canada" },
        { value: "mx", label: "Mexico" },
      ],
    },
    {
      label: "Europe",
      items: [
        { value: "fr", label: "France" },
        { value: "de", label: "Germany" },
        { value: "es", label: "Spain" },
      ],
    },
    {
      label: "Asia Pacific",
      items: [
        { value: "au", label: "Australia" },
        { value: "jp", label: "Japan" },
        { value: "sg", label: "Singapore" },
      ],
    },
  ]
</script>

<Field>
  <FieldLabel>Country</FieldLabel>
  <Select placeholder="Select a country">
    <SelectTrigger>
      <SelectValue />
      <ChevronDownIcon />
    </SelectTrigger>
    <SelectContent>
      <SelectInput
        aria-label="Search countries"
        placeholder="Search countries…"
      />
      <SelectEmpty>No countries found.</SelectEmpty>
      <SelectList>
        {#each regions as group (group.label)}
          <SelectGroup>
            <SelectGroupLabel>{group.label}</SelectGroupLabel>
            {#each group.items as item (item.value)}
              <SelectItem value={item.value} label={item.label}>
                <SelectItemText>
                  {#snippet render({ props, state })}
                    <span {...props}>
                      {#each state.segments as segment, index (index)}
                        {#if segment.match}
                          <b>{segment.text}</b>
                        {:else}
                          {segment.text}
                        {/if}
                      {/each}
                    </span>
                  {/snippet}
                </SelectItemText>
                <SelectItemIndicator>
                  <CheckIcon />
                </SelectItemIndicator>
              </SelectItem>
            {/each}
          </SelectGroup>
        {/each}
      </SelectList>
    </SelectContent>
  </Select>
</Field>
