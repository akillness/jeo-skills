import * as React from "react"
import {
  createCookieStorage,
  createLocalStorage,
  createSessionStorage,
  type ValueStorage,
} from "@ui-sdk/core"
import {
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
} from "@ui-sdk/react/field"
import {
  SegmentedControl,
  SegmentedControlIndicator,
  SegmentedControlItem,
} from "@ui-sdk/react/segmented-control"

const storages: { label: string; storage: ValueStorage; lasts: string }[] = [
  {
    label: "localStorage",
    storage: createLocalStorage("ui-sdk-note"),
    lasts: "Stays until cleared, in every tab.",
  },
  {
    label: "sessionStorage",
    storage: createSessionStorage("ui-sdk-note"),
    lasts: "Stays while this tab is open.",
  },
  {
    label: "Cookie",
    storage: createCookieStorage("ui-sdk-note"),
    lasts: "Stays a year, and the server reads it too.",
  },
]

const noServerValue = () => null

function Example() {
  const [picked, setPicked] = React.useState("localStorage")
  const { storage, lasts } = storages.find(({ label }) => label === picked)!
  const note = React.useSyncExternalStore(
    storage.subscribe,
    storage.get,
    noServerValue
  )
  const [available, setAvailable] = React.useState(true)
  React.useEffect(() => setAvailable(storage.available()), [storage])

  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <SegmentedControl
          aria-label="Keep the note in"
          value={picked}
          onValueChange={(next) => next && setPicked(next)}
        >
          <SegmentedControlIndicator />
          {storages.map(({ label }) => (
            <SegmentedControlItem key={label} value={label}>
              {label}
            </SegmentedControlItem>
          ))}
        </SegmentedControl>
      </div>
      <div data-slot="stack">
        <Field disabled={!available}>
          <FieldLabel>Note</FieldLabel>
          <FieldControl
            value={note ?? ""}
            onChange={(event) => storage.set(event.target.value)}
            placeholder={
              available ? "Type, then reload the page" : "Unavailable here"
            }
          />
          <FieldDescription>
            {available ? lasts : "This browser blocks it here."}
          </FieldDescription>
        </Field>
        <button
          type="button"
          onClick={() => storage.remove()}
          disabled={note === null}
        >
          Clear Note
        </button>
      </div>
    </div>
  )
}

export { Example }
