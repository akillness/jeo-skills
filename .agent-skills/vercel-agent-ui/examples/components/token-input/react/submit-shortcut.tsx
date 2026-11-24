import { Field, FieldLabel } from "@ui-sdk/react/field"
import {
  toLabel,
  TokenInput,
  TokenInputEditor,
} from "@ui-sdk/react/token-input"
import { useLog } from "../../../shared/react/log"

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
