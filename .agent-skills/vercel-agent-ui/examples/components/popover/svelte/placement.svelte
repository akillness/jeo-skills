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

  const sides = [
    { value: "top", label: "Top" },
    { value: "right", label: "Right" },
    { value: "bottom", label: "Bottom" },
    { value: "left", label: "Left" },
  ]
  const aligns = [
    { value: "start", label: "Start" },
    { value: "center", label: "Center" },
    { value: "end", label: "End" },
  ]
  type Side = "top" | "right" | "bottom" | "left"
  type Align = "start" | "center" | "end"

  let side = $state<Side>("bottom")
  let align = $state<Align>("center")
</script>

<div data-slot="stack">
  <div data-slot="controls">
    <Select
      items={sides}
      value={side}
      onValueChange={(next) => next && (side = next as Side)}
    >
      <SelectLabel>Side</SelectLabel>
      <SelectTrigger>
        <SelectValue />
        <ChevronDownIcon aria-hidden="true" />
      </SelectTrigger>
      <SelectContent>
        {#each sides as option (option.value)}
          <SelectItem value={option.value}>
            {option.label}
            <SelectItemIndicator>
              <CheckIcon aria-hidden="true" />
            </SelectItemIndicator>
          </SelectItem>
        {/each}
      </SelectContent>
    </Select>
    <Select
      items={aligns}
      value={align}
      onValueChange={(next) => next && (align = next as Align)}
    >
      <SelectLabel>Align</SelectLabel>
      <SelectTrigger>
        <SelectValue />
        <ChevronDownIcon aria-hidden="true" />
      </SelectTrigger>
      <SelectContent>
        {#each aligns as option (option.value)}
          <SelectItem value={option.value}>
            {option.label}
            <SelectItemIndicator>
              <CheckIcon aria-hidden="true" />
            </SelectItemIndicator>
          </SelectItem>
        {/each}
      </SelectContent>
    </Select>
  </div>
  <Popover>
    <PopoverTrigger>Delivery</PopoverTrigger>
    <PopoverContent {side} {align} sideOffset={8}>
      <PopoverTitle>Delivery window</PopoverTitle>
      <PopoverDescription
        >Arrives Tuesday between 9 AM and noon.</PopoverDescription
      >
    </PopoverContent>
  </Popover>
</div>
