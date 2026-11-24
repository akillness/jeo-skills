<script lang="ts">
  import { createPopoverController } from "@ui-sdk/core/popover"
  import {
    Popover,
    PopoverClose,
    PopoverContent,
    PopoverDescription,
    PopoverShortcut,
    PopoverTitle,
    PopoverTrigger,
  } from "../../src/popover"

  let {
    open = false,
    remote = false,
    disabled = false,
  }: { open?: boolean; remote?: boolean; disabled?: boolean } = $props()

  const share = createPopoverController()
</script>

{#if remote}
  <PopoverTrigger controller={share} shortcut="mod+i" {disabled}
    >Share<PopoverShortcut /></PopoverTrigger
  >
  <Popover controller={share}><PopoverContent>Share</PopoverContent></Popover>
{:else}
  <Popover defaultOpen={open}>
    <PopoverTrigger shortcut="mod+i">Profile<PopoverShortcut /></PopoverTrigger>
    <PopoverContent>
      <PopoverTitle>Edit profile</PopoverTitle>
      <PopoverDescription>Your name appears on your posts.</PopoverDescription>
      <PopoverClose>Close</PopoverClose>
    </PopoverContent>
  </Popover>
{/if}
