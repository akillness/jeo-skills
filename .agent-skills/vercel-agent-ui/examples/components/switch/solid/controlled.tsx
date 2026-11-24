import { createSwitchController } from "@ui-sdk/core/switch"
import { Switch, SwitchThumb } from "@ui-sdk/solid/switch"
import { createSignal } from "solid-js"
import { useLog } from "../../../shared/solid/log"

function Example() {
  const log = useLog()
  const wifi = createSwitchController()
  const [checked, setChecked] = createSignal(true)

  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button" onClick={() => wifi.toggle()}>
          Toggle
        </button>
      </div>
      <label data-slot="label">
        Wi-Fi
        <Switch
          checked={checked()}
          onCheckedChange={(next, details) => {
            setChecked(next)
            log(`${next ? "On" : "Off"} (${details.reason})`)
          }}
          controller={wifi}
        >
          <SwitchThumb />
        </Switch>
      </label>
    </div>
  )
}

export { Example }
