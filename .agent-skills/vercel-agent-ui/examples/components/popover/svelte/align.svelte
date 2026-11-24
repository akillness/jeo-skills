<script lang="ts">
  import {
    Popover,
    PopoverContent,
    PopoverDescription,
    PopoverTitle,
    PopoverTrigger,
  } from "@ui-sdk/svelte/popover"

  const aligns = [
    { value: "start", label: "Start" },
    { value: "center", label: "Center" },
    { value: "end", label: "End" },
  ] as const
</script>

<div data-slot="row">
  {#each aligns as align (align.value)}
    <Popover>
      <PopoverTrigger>{align.label}</PopoverTrigger>
      <PopoverContent align={align.value} sideOffset={8}>
        <PopoverTitle>Delivery window</PopoverTitle>
        <PopoverDescription
          >Arrives Tuesday between 9 AM and noon.</PopoverDescription
        >
      </PopoverContent>
    </Popover>
  {/each}
</div>
