<script lang="ts">
  import { ChevronDownIcon } from "@lucide/svelte"
  import {
    Collapsible,
    CollapsiblePanel,
    CollapsibleTrigger,
  } from "@ui-sdk/svelte/collapsible"
  import { useLog } from "../../../shared/svelte/log"

  const notes = [
    "Search now matches file contents, not only names.",
    "Shared links remember the folder they were opened from.",
    "Uploads resume after the connection drops.",
  ]

  const log = useLog()
</script>

<Collapsible
  data-variant="card"
  onOpenChangeComplete={(open) =>
    log(open ? "Finished opening" : "Finished closing")}
>
  <CollapsibleTrigger>
    <span data-slot="stack">
      <span>Release notes</span>
      <span data-slot="hint">Version 2.4, released October 28</span>
    </span>
    <ChevronDownIcon />
  </CollapsibleTrigger>
  <CollapsiblePanel>
    <ul>
      {#each notes as note (note)}
        <li>{note}</li>
      {/each}
    </ul>
  </CollapsiblePanel>
</Collapsible>
