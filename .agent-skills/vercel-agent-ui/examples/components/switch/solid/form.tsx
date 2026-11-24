import { FieldLegend, FieldSet } from "@ui-sdk/solid/field"
import { Switch, SwitchThumb } from "@ui-sdk/solid/switch"
import { useLog } from "../../../shared/solid/log"

function Example() {
  const log = useLog()

  return (
    <form
      data-slot="stack"
      onSubmit={(event) => {
        event.preventDefault()
        const entries = [...new FormData(event.currentTarget)].map(
          ([name, value]) => `${name}=${value}`
        )
        log(
          entries.length
            ? `Submitted ${entries.join("&")}`
            : "Submitted nothing"
        )
      }}
    >
      <FieldSet>
        <FieldLegend>Email notifications</FieldLegend>
        <label data-slot="label">
          Product updates
          <Switch name="updates">
            <SwitchThumb />
          </Switch>
        </label>
        <label data-slot="label">
          Security alerts
          <Switch name="security" defaultChecked>
            <SwitchThumb />
          </Switch>
        </label>
        <label data-slot="label">
          Weekly digest
          <Switch name="digest" value="weekly" defaultChecked>
            <SwitchThumb />
          </Switch>
        </label>
      </FieldSet>
      <div data-slot="row">
        <button type="submit" data-variant="solid">
          Save
        </button>
        <button type="reset">Reset</button>
      </div>
    </form>
  )
}

export { Example }
