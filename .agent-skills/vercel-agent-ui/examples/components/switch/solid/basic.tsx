import { Switch, SwitchThumb } from "@ui-sdk/solid/switch"

function Example() {
  return (
    <label data-slot="label">
      Airplane mode
      <Switch>
        <SwitchThumb />
      </Switch>
    </label>
  )
}

export { Example }
