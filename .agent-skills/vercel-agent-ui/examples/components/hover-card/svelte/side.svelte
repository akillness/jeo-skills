<script lang="ts">
  import { CheckIcon, ChevronDownIcon } from "@lucide/svelte"
  import {
    HoverCard,
    HoverCardArrow,
    HoverCardContent,
    HoverCardTrigger,
  } from "@ui-sdk/svelte/hover-card"
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
  <HoverCard>
    <HoverCardTrigger href="https://example.com/people/ines"
      >@ines</HoverCardTrigger
    >
    <HoverCardContent {side} {align} sideOffset={10}>
      <HoverCardArrow />
      <p>Inès Moreau</p>
      <p>Product designer. Leads the checkout redesign.</p>
    </HoverCardContent>
  </HoverCard>
</div>
