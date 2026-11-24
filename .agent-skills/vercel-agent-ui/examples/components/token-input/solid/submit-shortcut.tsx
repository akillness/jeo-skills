import { Field, FieldLabel } from "@ui-sdk/solid/field"
import {
  toLabel,
  TokenInput,
  TokenInputEditor,
} from "@ui-sdk/solid/token-input"
import { useLog } from "../../../shared/solid/log"

function Example() {
  const log = useLog()

  return (
    <Field>
      <FieldLabel>Message</FieldLabel>
      <TokenInput
        submitShortcut="mod+enter"
        onSubmit={(value) => log(`Sent ${toLabel(value)}`)}
      >
        <TokenInputEditor placeholder="Write a message…" />
      </TokenInput>
    </Field>
  )
}

export { Example }
