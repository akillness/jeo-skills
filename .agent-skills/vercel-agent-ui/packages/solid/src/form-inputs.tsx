import { createMemo, For, Show } from "solid-js"
import type { PrimitiveHandle } from "./use-primitive"

// The hidden inputs that take part in a form for a list's root, like a
// select's: one for the value, or one more per value with `multiple`. The
// value input's `value` attribute is the serialized value, so reading it
// follows every value change. `multiple` is the component's prop, read as a
// getter so a change adds or removes the inputs.
function formInputs(
  handle: PrimitiveHandle<any>,
  multiple: () => boolean | undefined
) {
  const input = handle.slot("form-input")
  const serialized = createMemo(
    () => (input.value, handle.api.internal.serialized() as string[])
  )
  return (
    <>
      <textarea {...input} />
      <Show when={multiple()}>
        <For each={serialized()}>
          {(key) => {
            const hidden = handle.slot("value-input", () => ({
              id: key,
              value: key,
            }))
            return <input {...hidden} />
          }}
        </For>
      </Show>
    </>
  )
}

export { formInputs }
