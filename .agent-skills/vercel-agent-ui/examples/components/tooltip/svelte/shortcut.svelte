<script lang="ts">
  import { SaveIcon } from "@lucide/svelte"
  import { registerShortcut } from "@ui-sdk/core/shortcuts"
  import {
    Tooltip,
    TooltipContent,
    TooltipShortcut,
    TooltipTrigger,
  } from "@ui-sdk/svelte/tooltip"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()

  $effect(() => {
    const offSave = registerShortcut("mod+s", () => log("Saved"))
    const offShare = registerShortcut("mod+shift+e", () => log("Shared"))
    return () => {
      offSave()
      offShare()
    }
  })
</script>

<div data-slot="row">
  <Tooltip shortcut="mod+s">
    <TooltipTrigger aria-label="Save" onclick={() => log("Saved")}>
      <SaveIcon aria-hidden="true" />
    </TooltipTrigger>
    <TooltipContent>
      Save
      <TooltipShortcut />
    </TooltipContent>
  </Tooltip>
  <Tooltip shortcut="mod+shift+e">
    <TooltipTrigger onclick={() => log("Shared")}>Share</TooltipTrigger>
    <TooltipContent>
      Share with your team
      <TooltipShortcut />
    </TooltipContent>
  </Tooltip>
</div>
