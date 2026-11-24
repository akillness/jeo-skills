<script lang="ts">
  import {
    Popover,
    PopoverArrow,
    PopoverContent,
    PopoverDescription,
    PopoverTitle,
    PopoverTrigger,
  } from "@ui-sdk/svelte/popover"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()
</script>

<Popover openOnHover delay={200} closeDelay={150}>
  <PopoverTrigger>@kofi</PopoverTrigger>
  <PopoverContent sideOffset={8}>
    <PopoverArrow />
    <PopoverTitle>Kofi Mensah</PopoverTitle>
    <PopoverDescription>Engineering manager, platform team.</PopoverDescription>
    <div data-slot="row">
      <button
        type="button"
        data-size="sm"
        data-variant="solid"
        onclick={() => log("Followed @kofi")}
      >
        Follow
      </button>
    </div>
  </PopoverContent>
</Popover>
