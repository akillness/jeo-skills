<script lang="ts">
  import { Label } from "@ui-sdk/svelte/label"
  import { Switch, SwitchThumb } from "@ui-sdk/svelte/switch"
</script>

<div data-slot="row">
  <Switch id="updates">
    <SwitchThumb />
  </Switch>
  <Label for="updates">Email me product updates</Label>
</div>
