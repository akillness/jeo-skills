<script lang="ts">
  import { CircleQuestionMarkIcon } from "@lucide/svelte"
  import {
    Popover,
    PopoverArrow,
    PopoverContent,
    PopoverDescription,
    PopoverTitle,
    PopoverTrigger,
  } from "@ui-sdk/svelte/popover"

  const sides = [
    { value: "top", label: "Top" },
    { value: "right", label: "Right" },
    { value: "bottom", label: "Bottom" },
    { value: "left", label: "Left" },
  ] as const
  type Side = (typeof sides)[number]["value"]

  let open = $state(false)
  let side = $state<Side>("bottom")
  let controls: HTMLDivElement | undefined = $state()
</script>

<div data-slot="stack">
  <div data-slot="controls" role="group" aria-label="Side" bind:this={controls}>
    {#each sides as option (option.value)}
      <button
        type="button"
        data-size="sm"
        aria-pressed={side === option.value}
        onclick={() => (side = option.value)}
      >
        {option.label}
      </button>
    {/each}
  </div>
  <Popover
    {open}
    onOpenChange={(next, details) => {
      const target = details.event?.target
      const inControls = target instanceof Node && controls?.contains(target)
      if (inControls && details.reason !== "escape-key") {
        return details.cancel()
      }
      open = next
    }}
  >
    <PopoverTrigger aria-label="Help">
      <CircleQuestionMarkIcon aria-hidden="true" />
    </PopoverTrigger>
    <PopoverContent {side} sideOffset={10} arrowPadding={12}>
      <PopoverArrow />
      <PopoverTitle>Keyboard shortcuts</PopoverTitle>
      <PopoverDescription>Press ? anywhere to see them all.</PopoverDescription>
    </PopoverContent>
  </Popover>
</div>
