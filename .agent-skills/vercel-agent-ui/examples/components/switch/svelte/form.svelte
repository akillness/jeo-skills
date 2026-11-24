<script lang="ts">
  import { FieldLegend, FieldSet } from "@ui-sdk/svelte/field"
  import { Switch, SwitchThumb } from "@ui-sdk/svelte/switch"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()
</script>

<form
  data-slot="stack"
  onsubmit={(event) => {
    event.preventDefault()
    const entries = [...new FormData(event.currentTarget)].map(
      ([name, value]) => `${name}=${value}`
    )
    log(entries.length ? `Submitted ${entries.join("&")}` : "Submitted nothing")
  }}
>
  <FieldSet>
    <FieldLegend>Email notifications</FieldLegend>
    <label data-slot="label">
      Product updates
      <Switch name="updates">
        <SwitchThumb />
      </Switch>
    </label>
    <label data-slot="label">
      Security alerts
      <Switch name="security" defaultChecked>
        <SwitchThumb />
      </Switch>
    </label>
    <label data-slot="label">
      Weekly digest
      <Switch name="digest" value="weekly" defaultChecked>
        <SwitchThumb />
      </Switch>
    </label>
  </FieldSet>
  <div data-slot="row">
    <button type="submit" data-variant="solid">Save</button>
    <button type="reset">Reset</button>
  </div>
</form>
