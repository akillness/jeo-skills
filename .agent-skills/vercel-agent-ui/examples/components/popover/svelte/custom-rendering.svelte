<script lang="ts">
  import {
    Popover,
    PopoverClose,
    PopoverContent,
    PopoverDescription,
    PopoverShortcut,
    PopoverTitle,
    PopoverTrigger,
  } from "@ui-sdk/svelte/popover"
</script>

<Popover>
  <PopoverTrigger shortcut="mod+u">
    {#snippet render({ props, state })}
      <button {...props}>
        {state.open ? "Hide Updates" : "Show Updates"}
        <PopoverShortcut>
          {#snippet children(shortcut)}{shortcut.text}{/snippet}
        </PopoverShortcut>
      </button>
    {/snippet}
  </PopoverTrigger>
  <PopoverContent>
    <PopoverTitle>
      {#snippet render({ props })}
        <h3 {...props}>Updates</h3>
      {/snippet}
    </PopoverTitle>
    <PopoverDescription>Version 2.4 adds threaded comments.</PopoverDescription>
    <PopoverClose href="#">
      {#snippet render({ props })}
        <a {...props}>Read the Changelog</a>
      {/snippet}
    </PopoverClose>
  </PopoverContent>
</Popover>
