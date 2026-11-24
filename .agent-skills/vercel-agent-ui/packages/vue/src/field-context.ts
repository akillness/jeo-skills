import type { field } from "@ui-sdk/core/field"
import { fieldControlId, madeLabel } from "@ui-sdk/core/renderer"
import { inject, type InjectionKey } from "vue"
import type { PrimitiveHandle } from "./use-primitive"

// The field's context, apart from its parts, so a control can join a field
// without bundling the field.
type FieldContext = PrimitiveHandle<typeof field> & {
  name: () => string | undefined
  disabled: () => boolean | undefined
}

const FieldKey: InjectionKey<FieldContext> = Symbol("field")

/**
 * Controls inside a field take its name and disabled state, and its ids and
 * validity through the field's control slot. Null outside a field. The
 * control takes the field's id, so the label points at it from the server's
 * HTML on, unless its own props give one. A control whose component makes the
 * id it renders, like a select's trigger, passes its attributes as `own`.
 * @stable
 */
function useFieldControl(own?: Record<string, unknown>) {
  const field = inject(FieldKey, null)
  if (!field) {
    return null
  }
  return {
    name: field.name,
    disabled: field.disabled,
    // Merges the field's attributes for its control into the control's props,
    // keeping the control's own description ahead of the field's. The field
    // decides the id.
    props: (props: Record<string, any>) => {
      const id = (own ?? props).id as string | undefined
      const label = props["aria-labelledby"]
      const merged = field.slot(
        "control",
        { id, describedBy: props["aria-describedby"] },
        {
          ...props,
          id: undefined,
          "aria-labelledby": madeLabel(label) ? undefined : label,
        }
      )
      // The field's label names the control over the control's own, like a
      // ComboboxLabel's, but not over the author's. The control stays its own
      // part for styling.
      return {
        ...merged,
        "aria-labelledby": merged["aria-labelledby"] ?? label,
        "data-slot": props["data-slot"],
      }
    },
  }
}

function useFieldControlId() {
  const field = inject(FieldKey, null)
  return field ? fieldControlId(field.api.id) : undefined
}

export { type FieldContext, FieldKey, useFieldControl, useFieldControlId }
