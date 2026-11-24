<script lang="ts">
  import { Switch, SwitchThumb } from "@ui-sdk/svelte/switch"
</script>

<div data-slot="stack">
  <label data-slot="label">
    Small
    <Switch data-size="sm">
      <SwitchThumb />
    </Switch>
  </label>
  <label data-slot="label">
    Default
    <Switch>
      <SwitchThumb />
    </Switch>
  </label>
</div>
