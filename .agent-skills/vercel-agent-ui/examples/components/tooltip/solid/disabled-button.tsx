import { Field, FieldLabel } from "@ui-sdk/solid/field"
import { Input } from "@ui-sdk/solid/input"
import { Tooltip, TooltipContent, TooltipTrigger } from "@ui-sdk/solid/tooltip"
import { createSignal } from "solid-js"
import { useLog } from "../../../shared/solid/log"

function Example() {
  const log = useLog()
  const [title, setTitle] = createSignal("")
  const blocked = () => !title().trim()

  return (
    <div data-slot="stack">
      <Field>
        <FieldLabel>Post title</FieldLabel>
        <Input value={title()} onValueChange={(value) => setTitle(value)} />
      </Field>
      <Tooltip disabled={!blocked()}>
        <TooltipTrigger
          data-variant="solid"
          aria-disabled={blocked() ? "true" : undefined}
          onClick={() => {
            if (!blocked()) {
              log(`Published “${title().trim()}”`)
            }
          }}
        >
          Publish
        </TooltipTrigger>
        <TooltipContent side="right">Add a title to publish</TooltipContent>
      </Tooltip>
    </div>
  )
}

export { Example }
