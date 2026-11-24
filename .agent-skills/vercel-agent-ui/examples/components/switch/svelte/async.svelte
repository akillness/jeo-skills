<script lang="ts">
  import { LoaderCircleIcon } from "@lucide/svelte"
  import { createSwitchController } from "@ui-sdk/core/switch"
  import { Switch, SwitchThumb } from "@ui-sdk/svelte/switch"
  import { useLog } from "../../../shared/svelte/log"

  const save = (_checked: boolean) =>
    new Promise((resolve) => setTimeout(resolve, 800))

  const log = useLog()
  const backups = createSwitchController()
  let saving = $state(false)
</script>

<label data-slot="label">
  Automatic backups
  <Switch
    controller={backups}
    aria-busy={saving}
    onCheckedChange={(next, details) => {
      if (details.reason === "imperative") {
        return
      }
      details.cancel()
      if (saving) {
        return
      }
      saving = true
      log("Saving…")
      save(next).then(() => {
        backups.setChecked(next, { reason: "imperative" })
        saving = false
        log(`Saved: ${next ? "on" : "off"}`)
      })
    }}
  >
    <SwitchThumb>
      {#if saving}<LoaderCircleIcon
          data-slot="spinner"
          aria-hidden="true"
        />{/if}
    </SwitchThumb>
  </Switch>
</label>
