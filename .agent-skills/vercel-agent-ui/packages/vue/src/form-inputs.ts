import { defineComponent, h, type PropType } from "vue"
import type { PrimitiveHandle } from "./use-primitive"

// The hidden inputs that take part in a form for a list's root, like a
// select's: one for the value, or one more per value with `multiple`. Its own
// component, so a value change renders only the inputs.
const FormInputs = defineComponent({
  name: "FormInputs",
  props: {
    handle: { type: Object as PropType<PrimitiveHandle<any>>, required: true },
  },
  setup(props) {
    return () => {
      const { handle } = props
      return [
        h("textarea", handle.slot("form-input")),
        ...(handle.state.multiple
          ? (handle.api.internal.serialized() as string[]).map((key) =>
              h("input", {
                key,
                ...handle.slot("value-input", { id: key, value: key }),
              })
            )
          : []),
      ]
    }
  },
})

export { FormInputs }
