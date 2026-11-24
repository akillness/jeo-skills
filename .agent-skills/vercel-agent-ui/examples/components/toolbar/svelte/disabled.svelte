<script lang="ts">
  import { Toolbar, ToolbarButton } from "@ui-sdk/svelte/toolbar"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()
</script>

<Toolbar aria-label="Message">
  <ToolbarButton onclick={() => log("Reply")}>Reply</ToolbarButton>
  <ToolbarButton disabled onclick={() => log("Archive")}>Archive</ToolbarButton>
  <ToolbarButton
    disabled
    focusableWhenDisabled={false}
    onclick={() => log("Delete")}>Delete</ToolbarButton
  >
</Toolbar>
