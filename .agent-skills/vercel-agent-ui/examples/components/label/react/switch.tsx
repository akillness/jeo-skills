import { Label } from "@ui-sdk/react/label"
import { Switch, SwitchThumb } from "@ui-sdk/react/switch"

function Example() {
  return (
    <div data-slot="row">
      <Switch id="updates">
        <SwitchThumb />
      </Switch>
      <Label htmlFor="updates">Email me product updates</Label>
    </div>
  )
}

export { Example }
