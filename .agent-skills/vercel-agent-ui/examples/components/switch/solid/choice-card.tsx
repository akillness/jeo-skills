import { Field, FieldDescription, FieldLabel } from "@ui-sdk/solid/field"
import { Switch, SwitchThumb } from "@ui-sdk/solid/switch"
import { For } from "solid-js"

const settings = [
  {
    label: "Public profile",
    description: "Anyone can see your name and photo.",
    defaultChecked: false,
  },
  {
    label: "Show activity status",
    description: "Teammates can see when you're online.",
    defaultChecked: true,
  },
]

function Example() {
  return (
    <div data-slot="stack">
      <For each={settings}>
        {(setting) => (
          <Field data-variant="card">
            <div data-slot="stack">
              <FieldLabel>{setting.label}</FieldLabel>
              <FieldDescription>{setting.description}</FieldDescription>
            </div>
            <Switch defaultChecked={setting.defaultChecked}>
              <SwitchThumb />
            </Switch>
          </Field>
        )}
      </For>
    </div>
  )
}

export { Example }
