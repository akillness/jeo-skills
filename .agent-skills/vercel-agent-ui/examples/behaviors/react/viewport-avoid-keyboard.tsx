import * as React from "react"
import { bindAvoidKeyboard } from "@ui-sdk/core"

const groceries = "Groceries\n- oat milk\n- lemons"

const count = (text: string) =>
  text.split("\n").filter((line) => line.startsWith("-")).length

function Example() {
  const [items, setItems] = React.useState(count(groceries))
  const lift = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => bindAvoidKeyboard(lift.current!), [])
  return (
    <div data-slot="groceries">
      <textarea
        aria-label="Groceries"
        rows={4}
        defaultValue={groceries}
        onChange={(event) => setItems(count(event.target.value))}
      />
      <p data-slot="hint">
        On a phone, tap the list, then scroll the page with the keyboard open.
      </p>
      <div ref={lift} data-slot="groceries-lift">
        <p aria-live="polite" data-slot="groceries-pill">
          {items === 1 ? "1 item" : `${items} items`} · Saved
        </p>
      </div>
    </div>
  )
}

export { Example }
