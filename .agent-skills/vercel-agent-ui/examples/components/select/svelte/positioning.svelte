<script lang="ts">
  import { CheckIcon, ChevronDownIcon } from "@lucide/svelte"
  import { Checkbox, CheckboxIndicator } from "@ui-sdk/svelte/checkbox"
  import {
    Select,
    SelectArrow,
    SelectContent,
    SelectItem,
    SelectItemIndicator,
    SelectLabel,
    SelectTrigger,
    SelectValue,
  } from "@ui-sdk/svelte/select"

  const fonts = [
    { value: "inter", label: "Inter" },
    { value: "geist", label: "Geist" },
    { value: "source-serif", label: "Source Serif" },
    { value: "geist-mono", label: "Geist Mono" },
  ]

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
  let align = $state<Align>("start")
  let box = $state<HTMLDivElement | null>(null)
  let anchored = $state(false)
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
        <ChevronDownIcon />
      </SelectTrigger>
      <SelectContent>
        {#each sides as option (option.value)}
          <SelectItem value={option.value}>
            {option.label}
            <SelectItemIndicator>
              <CheckIcon />
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
        <ChevronDownIcon />
      </SelectTrigger>
      <SelectContent>
        {#each aligns as option (option.value)}
          <SelectItem value={option.value}>
            {option.label}
            <SelectItemIndicator>
              <CheckIcon />
            </SelectItemIndicator>
          </SelectItem>
        {/each}
      </SelectContent>
    </Select>
    <label data-slot="label">
      <Checkbox
        checked={anchored}
        onCheckedChange={(next) => (anchored = next === true)}
      >
        <CheckboxIndicator>
          <CheckIcon />
        </CheckboxIndicator>
      </Checkbox>
      Anchor to the box
    </label>
  </div>
  <div bind:this={box} data-slot="card">
    <Select defaultValue="inter">
      <SelectTrigger aria-label="Font">
        <SelectValue />
        <ChevronDownIcon />
      </SelectTrigger>
      <SelectContent
        {side}
        {align}
        sideOffset={10}
        alignOffset={0}
        collisionPadding={16}
        anchor={anchored ? box : null}
      >
        <SelectArrow />
        {#each fonts as font (font.value)}
          <SelectItem value={font.value}>
            {font.label}
            <SelectItemIndicator>
              <CheckIcon />
            </SelectItemIndicator>
          </SelectItem>
        {/each}
      </SelectContent>
    </Select>
  </div>
</div>
