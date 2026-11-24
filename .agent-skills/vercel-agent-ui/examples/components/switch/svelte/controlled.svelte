<script lang="ts">
  import { createSwitchController } from "@ui-sdk/core/switch"
  import { Switch, SwitchThumb } from "@ui-sdk/svelte/switch"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()
  const wifi = createSwitchController()
  let checked = $state(true)
</script>

<div data-slot="stack">
  <div data-slot="controls">
    <button type="button" onclick={() => wifi.toggle()}>Toggle</button>
  </div>
  <label data-slot="label">
    Wi-Fi
    <Switch
      bind:checked
      onCheckedChange={(next, details) =>
        log(`${next ? "On" : "Off"} (${details.reason})`)}
      controller={wifi}
    >
      <SwitchThumb />
    </Switch>
  </label>
</div>
