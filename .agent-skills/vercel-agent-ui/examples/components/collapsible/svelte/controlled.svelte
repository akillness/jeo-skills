<script lang="ts">
  import { ChevronDownIcon } from "@lucide/svelte"
  import {
    Collapsible,
    CollapsiblePanel,
    CollapsibleTrigger,
    createCollapsibleController,
  } from "@ui-sdk/svelte/collapsible"
  import { useLog } from "../../../shared/svelte/log"

  const recoveryCodes = ["7KQ2-M9XD", "P4TR-8HZC", "W3NB-6JUE", "C5YF-2LSA"]

  const log = useLog()
  const collapsible = createCollapsibleController()

  let open = $state(false)
</script>

<div data-slot="stack">
  <div data-slot="controls">
    <button type="button" onclick={() => collapsible.toggle()}>Toggle</button>
  </div>
  <Collapsible
    data-variant="card"
    bind:open
    controller={collapsible}
    onOpenChange={(next, details) =>
      log(`${next ? "Opened" : "Closed"} (${details.reason})`)}
  >
    <CollapsibleTrigger>
      <span data-slot="stack">
        <span>Recovery codes</span>
        <span data-slot="hint">Each code signs you in once</span>
      </span>
      <ChevronDownIcon />
    </CollapsibleTrigger>
    <CollapsiblePanel>
      <div data-slot="stack">
        <ul>
          {#each recoveryCodes as code (code)}
            <li>{code}</li>
          {/each}
        </ul>
        <button type="button" onclick={() => collapsible.close()}>Done</button>
      </div>
    </CollapsiblePanel>
  </Collapsible>
</div>
