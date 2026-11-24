import { Switch, SwitchThumb } from "@ui-sdk/react/switch"

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
