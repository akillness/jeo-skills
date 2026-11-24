import { Switch, SwitchThumb } from "@ui-sdk/solid/switch"

function Example() {
  return (
    <div data-slot="stack">
      <label data-slot="label">
        Product updates
        <Switch>
          <SwitchThumb />
        </Switch>
      </label>
      <label data-slot="label">
        Security alerts
        <Switch defaultChecked disabled>
          <SwitchThumb />
        </Switch>
      </label>
    </div>
  )
}

export { Example }
