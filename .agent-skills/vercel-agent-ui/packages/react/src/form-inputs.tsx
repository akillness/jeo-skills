import { readIn, slotIn, usePart, type PrimitiveHandle } from "./use-primitive"

// The hidden inputs that take part in a form for a list's root, like a
// select's: one for the value, or one more per value with `multiple`. Next to
// the root, outside it, so they take its handle.
function FormInputs({ handle }: { handle: PrimitiveHandle<any> }) {
  const inputs = ({ value, ...input }: Record<string, any>) => (
    <>
      <textarea {...input} defaultValue={value} />
      {handle.state.multiple &&
        readIn(handle, () => handle.api.internal.serialized() as string[]).map(
          (key) => {
            const { value, ...hidden } = slotIn(handle, "value-input", {
              id: key,
              value: key,
            })
            return <input key={key} {...hidden} defaultValue={value} />
          }
        )}
    </>
  )
  return usePart(handle, "form-input", {}, { render: inputs }, "textarea")
}

export { FormInputs }
