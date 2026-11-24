import { Switch, SwitchThumb } from "@ui-sdk/react/switch"
import { MoonIcon, SunIcon } from "lucide-react"

function Example() {
  return (
    <label data-slot="label">
      Dark mode
      <Switch>
        <SwitchThumb
          render={(props, state) => (
            <span {...props}>
              {state.checked ? (
                <MoonIcon aria-hidden="true" />
              ) : (
                <SunIcon aria-hidden="true" />
              )}
            </span>
          )}
        />
      </Switch>
    </label>
  )
}

export { Example }
