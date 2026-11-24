import { Field, FieldDescription, FieldLabel } from "@ui-sdk/react/field"
import { Switch, SwitchThumb } from "@ui-sdk/react/switch"

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
      {settings.map((setting) => (
        <Field key={setting.label} data-variant="card">
          <div data-slot="stack">
            <FieldLabel>{setting.label}</FieldLabel>
            <FieldDescription>{setting.description}</FieldDescription>
          </div>
          <Switch defaultChecked={setting.defaultChecked}>
            <SwitchThumb />
          </Switch>
        </Field>
      ))}
    </div>
  )
}

export { Example }
