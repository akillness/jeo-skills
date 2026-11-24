import type { field } from "@ui-sdk/core/field"
import { fieldControlId, madeLabel } from "@ui-sdk/core/renderer"
import { dynamic, type JSX } from "@solidjs/web"
import {
  createComponent,
  createContext,
  merge,
  omit,
  untrack,
  useContext,
} from "solid-js"
import type { PartProps, PrimitiveHandle } from "./use-primitive"

// The field's context, apart from its parts, so a control can join a field
// without bundling the field.
type FieldContextValue = PrimitiveHandle<typeof field> & {
  name: () => string | undefined
  disabled: () => boolean | undefined
}

const FieldContext = createContext<FieldContextValue | null>(null)

/**
 * Controls inside a field take its name and disabled state, and its ids and
 * validity through the field's control slot. Null outside a field. The
 * control takes the field's id, so the label points at it from the server's
 * HTML on, unless its own props give one. A control whose component makes the
 * id it renders, like a select's trigger, passes those props as `own`.
 * @stable
 */
function useFieldControl(own?: { id?: unknown }) {
  const field = useContext(FieldContext)
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
      const merged = field.slot(
        "control",
        () => ({
          id: untrack(() => (own ?? props).id) as string | undefined,
          describedBy: props["aria-describedby"],
        }),
        merge(omit(props, "id", "aria-labelledby"), {
          get "aria-labelledby"() {
            return madeLabel(props["aria-labelledby"])
              ? undefined
              : props["aria-labelledby"]
          },
        })
      )
      // The field's label names the control over the control's own, like a
      // ComboboxLabel's, but not over the author's. The control stays its own
      // part for styling.
      return merge(merged, {
        get "aria-labelledby"() {
          return merged["aria-labelledby"] ?? props["aria-labelledby"]
        },
        get "data-slot"() {
          return props["data-slot"]
        },
      })
    },
  }
}

/**
 * A control's props for `usePart`, joining the field it's in, if any: the
 * field's attributes for its control go over the control's own, merged ones,
 * so they render through `render`, which then renders the user's `render`
 * or `tag`.
 */
function joinField(
  field: ReturnType<typeof useFieldControl>,
  props: Record<string, any>,
  tag: keyof JSX.IntrinsicElements
) {
  if (!field) {
    return props
  }
  const render = untrack(() => props.render)
  return merge(props, {
    render: (merged: Record<string, any>, state: unknown) => {
      const joined = field.props(merged)
      if (typeof render === "function") {
        return render(joined, state)
      }
      return createComponent(
        dynamic(() => tag),
        joined
      )
    },
  })
}

// Props a button takes that mean something else on a checkbox or a switch.
type ButtonControlProps<State> = Omit<
  PartProps<"button", State>,
  "value" | "name" | "form" | "onChange" | "onSelect"
>

function useFieldControlId() {
  const field = useContext(FieldContext)
  return field ? fieldControlId(field.api.id) : undefined
}

export {
  type ButtonControlProps,
  FieldContext,
  type FieldContextValue,
  joinField,
  useFieldControl,
  useFieldControlId,
}
