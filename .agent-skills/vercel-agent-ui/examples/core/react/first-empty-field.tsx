import * as React from "react"
import { definePrimitive, elements } from "@ui-sdk/core"
import { Field, FieldControl, FieldLabel } from "@ui-sdk/react/field"
import { createParts } from "@ui-sdk/react/primitive"

type CheckoutState = { missing: string | null }

const checkout = definePrimitive({
  name: "checkout",
  state: (): CheckoutState => ({ missing: null }),
  api: (context) => ({
    next() {
      const fields = elements<{ value: string }>(context, "field")
      const empty = fields.find(
        (field) => (field.el as HTMLInputElement).value === ""
      )
      empty?.el.focus()
      context.store.set({ missing: empty ? empty.props.value : null })
    },
  }),
  slots: (slot) => ({
    field: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (_state, part) => ({ name: part.props.value }),
    }),
    next: slot<{}, CheckoutState>({
      state: (state) => ({ missing: state.missing }),
      attrs: () => ({ type: "button" }),
      press: ({ api }) => api.next(),
    }),
  }),
})

const parts = createParts(checkout, { field: "input", next: "button" })

const Checkout = parts.Root

const CheckoutField = parts.Field

const CheckoutNext = parts.Next

const fields = [
  { value: "name", label: "Name", defaultValue: "Hollis Grant" },
  { value: "email", label: "Email" },
  { value: "address", label: "Address" },
]

function Example() {
  return (
    <Checkout>
      <div data-slot="stack">
        {fields.map(({ value, label, defaultValue }) => (
          <Field key={value}>
            <FieldLabel>{label}</FieldLabel>
            <FieldControl
              render={<CheckoutField value={value} />}
              defaultValue={defaultValue}
            />
          </Field>
        ))}
        <CheckoutNext data-variant="solid">
          {({ missing }) =>
            missing
              ? `Fill In ${missing[0].toUpperCase()}${missing.slice(1)}`
              : "Find Empty Field"
          }
        </CheckoutNext>
      </div>
    </Checkout>
  )
}

export {
  checkout,
  Checkout,
  CheckoutField,
  CheckoutNext,
  type CheckoutState,
  Example,
}
