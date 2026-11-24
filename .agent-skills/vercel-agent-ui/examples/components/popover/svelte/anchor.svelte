<script lang="ts">
  import { CheckIcon, SlidersHorizontalIcon } from "@lucide/svelte"
  import { Checkbox, CheckboxIndicator } from "@ui-sdk/svelte/checkbox"
  import {
    Popover,
    PopoverClose,
    PopoverContent,
    PopoverDescription,
    PopoverTitle,
    PopoverTrigger,
  } from "@ui-sdk/svelte/popover"

  const types = [
    { label: "Documents", checked: true },
    { label: "Images", checked: false },
    { label: "Shared with me", checked: true },
  ]

  let anchor: HTMLInputElement | undefined = $state()
</script>

<div data-slot="row">
  <input
    bind:this={anchor}
    type="search"
    placeholder="Search files…"
    aria-label="Search files"
  />
  <Popover>
    <PopoverTrigger aria-label="Search filters">
      <SlidersHorizontalIcon aria-hidden="true" />
    </PopoverTrigger>
    <PopoverContent {anchor} align="start" sideOffset={8}>
      <PopoverTitle>Filters</PopoverTitle>
      <PopoverDescription>Show only these kinds of files.</PopoverDescription>
      <div data-slot="stack">
        {#each types as type (type.label)}
          <label data-slot="label">
            <Checkbox defaultChecked={type.checked}>
              <CheckboxIndicator>
                <CheckIcon aria-hidden="true" />
              </CheckboxIndicator>
            </Checkbox>
            {type.label}
          </label>
        {/each}
      </div>
      <div data-slot="row">
        <PopoverClose>Cancel</PopoverClose>
        <PopoverClose data-variant="solid">Apply</PopoverClose>
      </div>
    </PopoverContent>
  </Popover>
</div>
