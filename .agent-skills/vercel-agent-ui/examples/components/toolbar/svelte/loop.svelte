<script lang="ts">
  import { Toolbar, ToolbarButton } from "@ui-sdk/svelte/toolbar"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()
</script>

<Toolbar loop={false} aria-label="Pages">
  {#each ["First", "Previous", "Next", "Last"] as label (label)}
    <ToolbarButton onclick={() => log(`${label} page`)}>{label}</ToolbarButton>
  {/each}
</Toolbar>
