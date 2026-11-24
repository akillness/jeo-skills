<script lang="ts">
  import { Button } from "@ui-sdk/svelte/button"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

  async function save() {
    await wait(1000)
    log("Couldn't save. Check your connection and try again.")
    throw new Error("Couldn't save")
  }
</script>

<div data-slot="stack">
  <Button onclick={save}>
    {#snippet render({ props, state })}
      <button {...props}
        >{state.pending
          ? "Saving…"
          : state.error
            ? "Try Again"
            : "Save Changes"}</button
      >
    {/snippet}
  </Button>
</div>
