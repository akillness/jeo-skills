import { createSignal, createUniqueId } from "solid-js"
import { Button } from "@ui-sdk/solid/button"
import { Field, FieldLabel } from "@ui-sdk/solid/field"
import { Input } from "@ui-sdk/solid/input"
import { useLog } from "../../../shared/solid/log"

function Example() {
  const log = useLog()
  const [title, setTitle] = createSignal("")
  const hint = createUniqueId()
  const ready = () => title().trim() !== ""

  return (
    <div data-slot="stack">
      <Field>
        <FieldLabel>Title</FieldLabel>
        <Input value={title()} onValueChange={(value) => setTitle(value)} />
      </Field>
      <div data-slot="row">
        <Button
          disabled={!ready()}
          focusableWhenDisabled
          aria-describedby={hint}
          onClick={() => log(`Published “${title()}”`)}
        >
          Publish
        </Button>
        <p id={hint} data-slot="hint">
          {ready() ? "Ready to publish." : "Add a title to publish."}
        </p>
      </div>
    </div>
  )
}

export { Example }
