<script lang="ts">
  import { LoaderCircleIcon } from "@lucide/svelte"
  import {
    Command,
    CommandInput,
    CommandItem,
    CommandList,
  } from "@ui-sdk/svelte/command"
  import { useLog } from "../../../shared/svelte/log"

  const wait = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms))

  const log = useLog()

  async function deploy() {
    await wait(1200)
    log("Deployed to production")
  }

  async function sync() {
    await wait(600)
    log("Couldn't sync: offline")
    throw new Error("Offline")
  }
</script>

<div data-slot="stack">
  <Command>
    <CommandInput aria-label="Search actions" placeholder="Search actions…" />
    <CommandList>
      <CommandItem value="deploy" onSelect={deploy}>
        {#snippet children(state)}
          Deploy to production
          {#if state.pending}<LoaderCircleIcon
              data-slot="spinner"
              aria-hidden="true"
            />{/if}
        {/snippet}
      </CommandItem>
      <CommandItem value="sync" onSelect={sync}>
        {#snippet children(state)}
          Sync with server
          {#if state.pending}
            <LoaderCircleIcon data-slot="spinner" aria-hidden="true" />
          {:else if state.error !== undefined}
            <span data-slot="hint">Failed, try again</span>
          {/if}
        {/snippet}
      </CommandItem>
    </CommandList>
  </Command>
</div>
