import { Label } from "@ui-sdk/solid/label"
import { Switch, SwitchThumb } from "@ui-sdk/solid/switch"

function Example() {
  return (
    <div data-slot="row">
      <Switch id="updates">
        <SwitchThumb />
      </Switch>
      <Label for="updates">Email me product updates</Label>
    </div>
  )
}

export { Example }
