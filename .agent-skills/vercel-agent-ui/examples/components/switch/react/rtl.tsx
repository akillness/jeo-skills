import { Switch, SwitchThumb } from "@ui-sdk/react/switch"

function Example() {
  return (
    <div dir="rtl">
      <label data-slot="label">
        وضع الطيران
        <Switch>
          <SwitchThumb />
        </Switch>
      </label>
    </div>
  )
}

export { Example }
