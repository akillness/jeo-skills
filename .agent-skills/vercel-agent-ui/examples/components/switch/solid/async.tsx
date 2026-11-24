import { createSwitchController } from "@ui-sdk/core/switch"
import { Switch, SwitchThumb } from "@ui-sdk/solid/switch"
import { createSignal, Show } from "solid-js"
import { useLog } from "../../../shared/solid/log"

const save = (_checked: boolean) =>
  new Promise((resolve) => setTimeout(resolve, 800))

function Example() {
  const log = useLog()
  const backups = createSwitchController()
  const [saving, setSaving] = createSignal(false)
  let pending = false

  return (
    <label data-slot="label">
      Automatic backups
      <Switch
        controller={backups}
        aria-busy={saving() ? "true" : "false"}
        onCheckedChange={(next, details) => {
          if (details.reason === "imperative") {
            return
          }
          details.cancel()
          if (pending) {
            return
          }
          pending = true
          setSaving(true)
          log("Saving…")
          save(next).then(() => {
            pending = false
            backups.setChecked(next, { reason: "imperative" })
            setSaving(false)
            log(`Saved: ${next ? "on" : "off"}`)
          })
        }}
      >
        <SwitchThumb>
          <Show when={saving()}>
            <svg
              data-slot="spinner"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          </Show>
        </SwitchThumb>
      </Switch>
    </label>
  )
}

export { Example }
