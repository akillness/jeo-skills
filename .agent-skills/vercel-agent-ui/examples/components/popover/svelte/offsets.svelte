<script lang="ts">
  import { CheckIcon, ChevronDownIcon } from "@lucide/svelte"
  import {
    Popover,
    PopoverContent,
    PopoverDescription,
    PopoverTitle,
    PopoverTrigger,
  } from "@ui-sdk/svelte/popover"
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectItemIndicator,
    SelectLabel,
    SelectTrigger,
    SelectValue,
  } from "@ui-sdk/svelte/select"

  const choices = {
    sideOffset: { label: "Side offset", values: ["4", "8", "16", "24"] },
    alignOffset: { label: "Align offset", values: ["-16", "0", "16"] },
    collisionPadding: { label: "Collision padding", values: ["8", "24", "48"] },
  }
  type Name = keyof typeof choices

  let offsets = $state<Record<Name, string>>({
    sideOffset: "8",
    alignOffset: "0",
    collisionPadding: "8",
  })
</script>

<div data-slot="stack">
  <div data-slot="controls">
    {#each Object.keys(choices) as Name[] as name (name)}
      <Select
        items={choices[name].values}
        value={offsets[name]}
        onValueChange={(next) => next && (offsets[name] = next)}
      >
        <SelectLabel>{choices[name].label}</SelectLabel>
        <SelectTrigger>
          <SelectValue />
          <ChevronDownIcon aria-hidden="true" />
        </SelectTrigger>
        <SelectContent>
          {#each choices[name].values as value (value)}
            <SelectItem {value}>
              {value}px
              <SelectItemIndicator>
                <CheckIcon aria-hidden="true" />
              </SelectItemIndicator>
            </SelectItem>
          {/each}
        </SelectContent>
      </Select>
    {/each}
  </div>
  <Popover>
    <PopoverTrigger>Delivery</PopoverTrigger>
    <PopoverContent
      align="start"
      sideOffset={Number(offsets.sideOffset)}
      alignOffset={Number(offsets.alignOffset)}
      collisionPadding={Number(offsets.collisionPadding)}
    >
      <PopoverTitle>Delivery window</PopoverTitle>
      <PopoverDescription
        >Arrives Tuesday between 9 AM and noon.</PopoverDescription
      >
    </PopoverContent>
  </Popover>
</div>
