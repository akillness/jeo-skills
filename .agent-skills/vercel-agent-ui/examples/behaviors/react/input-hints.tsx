import * as React from "react"
import { inputHints, type EnterKeyHint, type InputHintKind } from "@ui-sdk/core"
import {
  Field,
  FieldControl,
  FieldDescription,
  FieldLabel,
} from "@ui-sdk/react/field"

const fields: { label: string; kind: InputHintKind; enter?: EnterKeyHint }[] = [
  { label: "Email", kind: "email", enter: "next" },
  { label: "Phone", kind: "tel", enter: "next" },
  { label: "Verification code", kind: "one-time-code", enter: "done" },
  { label: "Search", kind: "search" },
  { label: "Message", kind: "message" },
]

const keys: Record<string, string> = {
  text: "Letter keys",
  email: "Email keys",
  tel: "Phone pad with + * #",
  url: "Web address keys",
  numeric: "Number pad",
  decimal: "Number pad with a decimal point",
  search: "Search keys",
}

const pads = new Set(["tel", "numeric", "decimal"])

const returns: Record<EnterKeyHint, string> = {
  enter: "return or ⏎",
  next: "next or ›",
  previous: "previous or ‹",
  done: "done or ✓",
  go: "go or →",
  search: "search or →",
  send: "send or ↑",
}

function Example() {
  return (
    <form data-slot="stack" onSubmit={(event) => event.preventDefault()}>
      {fields.map(({ label, kind, enter }) => {
        const hints = inputHints(kind, { enter })
        return (
          <Field key={kind}>
            <FieldLabel>{label}</FieldLabel>
            <FieldControl {...hints} />
            <FieldDescription>
              {keys[hints.inputMode ?? "text"]}
              {pads.has(hints.inputMode ?? "")
                ? ""
                : ` · Return says ${returns[hints.enterKeyHint ?? "enter"]}`}
            </FieldDescription>
          </Field>
        )
      })}
    </form>
  )
}

export { Example }
