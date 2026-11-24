<script lang="ts">
  import type { PopoverController } from "@ui-sdk/core/popover"
  import {
    Popover,
    PopoverContent,
    PopoverShortcut,
    PopoverTrigger,
  } from "../../src/popover"

  let {
    controller,
    nested,
    remote,
  }: {
    controller?: PopoverController<any>
    nested?: boolean
    remote?: boolean
  } = $props()

  let triggerShown = $state(true)
  export const removeTrigger = () => (triggerShown = false)
</script>

<button>Before</button>
<Popover {controller}>
  {#if triggerShown}
    <PopoverTrigger>Open</PopoverTrigger>
  {/if}
  <PopoverContent aria-label="Outer">
    <input aria-label="Name" />
    {#if nested}
      <Popover>
        <PopoverTrigger>More</PopoverTrigger>
        <PopoverContent aria-label="Inner"
          ><button>Archive</button></PopoverContent
        >
      </Popover>
    {/if}
  </PopoverContent>
</Popover>
<button>After</button>
{#if remote}
  <PopoverTrigger {controller} shortcut="mod+e"
    >Share<PopoverShortcut /></PopoverTrigger
  >
{/if}
