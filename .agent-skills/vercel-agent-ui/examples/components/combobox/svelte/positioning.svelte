<script lang="ts">
  import { CheckIcon, ChevronDownIcon } from "@lucide/svelte"
  import { Checkbox, CheckboxIndicator } from "@ui-sdk/svelte/checkbox"
  import {
    Combobox,
    ComboboxContent,
    ComboboxEmpty,
    ComboboxInput,
    ComboboxItem,
    ComboboxItemIndicator,
    ComboboxList,
  } from "@ui-sdk/svelte/combobox"
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectItemIndicator,
    SelectLabel,
    SelectTrigger,
    SelectValue,
  } from "@ui-sdk/svelte/select"

  const frameworks = [
    { value: "next", label: "Next.js" },
    { value: "sveltekit", label: "SvelteKit" },
    { value: "nuxt", label: "Nuxt" },
    { value: "remix", label: "Remix" },
    { value: "astro", label: "Astro" },
    { value: "solidstart", label: "SolidStart" },
    { value: "qwik", label: "Qwik City" },
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
          <CheckIcon aria-hidden="true" />
        </CheckboxIndicator>
      </Checkbox>
      Anchor to the box
    </label>
  </div>
  <div bind:this={box} data-slot="card">
    <Combobox>
      <ComboboxInput aria-label="Framework" placeholder="Framework" />
      <ComboboxContent
        {side}
        {align}
        sideOffset={10}
        alignOffset={0}
        collisionPadding={16}
        anchor={anchored ? box : null}
      >
        <ComboboxEmpty>No frameworks found.</ComboboxEmpty>
        <ComboboxList>
          {#each frameworks as framework (framework.value)}
            <ComboboxItem value={framework.value} label={framework.label}>
              {framework.label}
              <ComboboxItemIndicator>
                <CheckIcon />
              </ComboboxItemIndicator>
            </ComboboxItem>
          {/each}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  </div>
</div>
