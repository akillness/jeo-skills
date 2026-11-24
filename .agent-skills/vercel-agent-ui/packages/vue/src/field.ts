import {
  fieldGroup as fieldGroupPrimitive,
  field as fieldPrimitive,
  fieldSet as fieldSetPrimitive,
  type FieldDescriptionState,
  type FieldErrorState,
  type ValidityKey,
} from "@ui-sdk/core/field"
import {
  checkFieldOutside,
  fieldOutsideAttrs,
  fieldOutsideErrorShown,
  fieldOutsideState,
  type FieldOutsideSlot,
} from "@ui-sdk/core/renderer"
import {
  defineComponent,
  inject,
  provide,
  useAttrs,
  useId,
  useSlots,
  type InjectionKey,
  type PropType,
} from "vue"
import { slotContent } from "./children"
import { withElement } from "./create-parts"
import {
  optionalBoolean,
  renderElement,
  usePart,
  usePrimitive,
  useScope,
  type PartElement,
  type PrimitiveHandle,
  type PartSlots,
  type StateSlots,
} from "./use-primitive"
import { FieldKey, type FieldContext } from "./field-context"

type FieldSetContext = PrimitiveHandle<typeof fieldSetPrimitive>
// What a FieldDescription describes: the nearest Field, or a FieldSet when no
// Field is closer.
const DescribedKey: InjectionKey<FieldContext | FieldSetContext> =
  Symbol("field-described")

// Checks a part outside a field once it's in the page. Made once, so every
// render hands Vue the same ref.
const outsideRefs: Partial<Record<FieldOutsideSlot, (el: unknown) => void>> = {
  label: (el) => checkFieldOutside(el as Element | null, "label"),
  control: (el) => checkFieldOutside(el as Element | null, "control"),
}

// A part outside any Field: a plain element with no field wiring, so a
// FieldLabel is a native <label> that labels the control it wraps. Call it
// in setup; it returns the render function.
function useOutside(
  slot: FieldOutsideSlot,
  element: PartElement<FieldErrorState>,
  shown = () => true
) {
  const attrs = useAttrs()
  const slots = useSlots()
  const ref = outsideRefs[slot]
  return () => {
    if (!shown()) {
      return null
    }
    const props = { ...fieldOutsideAttrs(slot), ...attrs, ...(ref && { ref }) }
    return renderElement(props, slots, fieldOutsideState, element)
  }
}

// A part keyed by the `id` attribute it's given, so core keeps that id on its element.
function useIdProp() {
  const attrs = useAttrs()
  return () => ({ id: attrs.id as string | undefined })
}

/**
 * Ties a form control to its label, description and error messages.
 * @stable
 */
const Field = withElement(
  "div",
  defineComponent({
    name: "Field",
    inheritAttrs: false,
    props: {
      name: String,
      disabled: optionalBoolean,
      invalid: optionalBoolean,
      debug: optionalBoolean,
    },
    slots: Object as PartSlots<typeof fieldPrimitive, "root">,
    setup(props) {
      const field = usePrimitive(fieldPrimitive, () => ({
        name: props.name,
        disabled: props.disabled,
        invalid: props.invalid,
        debug: props.debug,
      }))
      const context = {
        ...field,
        name: () => props.name,
        disabled: () => props.disabled,
      }
      provide(FieldKey, context)
      provide(DescribedKey, context)
      return usePart(field, "root")
    },
  })
)

/**
 * The field's label, which names its control. Outside a Field it's a plain
 * <label>, which labels the control inside it, like a card around a whole Field.
 * @stable
 */
const FieldLabel = withElement(
  "label",
  defineComponent({
    name: "FieldLabel",
    inheritAttrs: false,
    slots: Object as PartSlots<typeof fieldPrimitive, "label">,
    setup() {
      const field = inject(FieldKey, null)
      if (!field) {
        return useOutside("label", { tag: "label" })
      }
      return usePart(field, "label", useIdProp(), undefined, "label")
    },
  })
)

/**
 * Describes its Field. Right inside a FieldSet, outside any Field, it describes
 * the group, so screen readers say it as focus enters the group.
 * @stable
 */
const FieldDescription = withElement(
  "p",
  defineComponent({
    name: "FieldDescription",
    inheritAttrs: false,
    // A field set's description has only the set's state.
    slots: Object as StateSlots<FieldDescriptionState>,
    setup() {
      const described = inject(DescribedKey, null)
      if (!described) {
        return useOutside("description", { tag: "p" })
      }
      const attrs = useAttrs()
      const made = useId()
      // A field set's description slot takes the same props, and its state is the
      // `disabled` that FieldDescriptionState always has.
      return usePart(
        described as FieldContext,
        "description",
        () => ({ id: attrs.id as string | undefined, value: made }),
        undefined,
        "p"
      )
    },
  })
)

/**
 * Shows while the field shows as invalid. Without content, it shows the
 * browser's message for the current problem.
 * @stable
 */
const FieldError = withElement(
  "div",
  defineComponent({
    name: "FieldError",
    inheritAttrs: false,
    props: {
      match: {
        type: [Boolean, String] as PropType<boolean | ValidityKey>,
        default: undefined,
      },
    },
    slots: Object as PartSlots<typeof fieldPrimitive, "error">,
    setup(props, { slots }) {
      const attrs = useAttrs()
      const made = useId()
      const field = inject(FieldKey, null)
      const element = {
        tag: "div",
        children: (state: FieldErrorState) =>
          slotContent(slots.default, { state }) ?? state.message,
      }
      if (!field) {
        return useOutside("error", element, () =>
          fieldOutsideErrorShown({ match: props.match })
        )
      }
      // Each error is its own part, keyed by a made value. Core gives the first one
      // that shows the id the control points at before the field binds.
      return usePart(
        field,
        "error",
        () => ({
          id: attrs.id as string | undefined,
          value: made,
          match: props.match,
        }),
        undefined,
        element
      )
    },
  })
)

/**
 * A native control: an <input> by default, or anything through the `render` slot.
 * @stable
 */
const FieldControl = withElement(
  "input",
  defineComponent({
    name: "FieldControl",
    inheritAttrs: false,
    slots: Object as PartSlots<typeof fieldPrimitive, "control">,
    setup() {
      const field = inject(FieldKey, null)
      if (!field) {
        return useOutside("control", { tag: "input" })
      }
      const attrs = useAttrs()
      const control = () => ({
        id: attrs.id as string | undefined,
        describedBy: attrs["aria-describedby"] as string | undefined,
      })
      return usePart(
        field,
        "control",
        control,
        () => ({ name: field.name(), ...attrs }),
        "input"
      )
    },
  })
)

/**
 * A native <fieldset>, so `disabled` disables every control inside it.
 * @stable
 */
const FieldSet = withElement(
  "fieldset",
  defineComponent({
    name: "FieldSet",
    inheritAttrs: false,
    props: { disabled: optionalBoolean, debug: optionalBoolean },
    slots: Object as PartSlots<typeof fieldSetPrimitive, "set">,
    setup(props) {
      const set = usePrimitive(fieldSetPrimitive, () => ({
        disabled: props.disabled,
        debug: props.debug,
      }))
      provide(DescribedKey, set)
      return usePart(set, "set", undefined, undefined, "fieldset")
    },
  })
)

/**
 * Names the field set. Keep it the set's first child, where a <legend> names it natively.
 * @stable
 */
const FieldLegend = withElement(
  "legend",
  defineComponent({
    name: "FieldLegend",
    inheritAttrs: false,
    slots: Object as PartSlots<typeof fieldSetPrimitive, "legend">,
    setup() {
      const set = useScope(fieldSetPrimitive)?.handle
      if (!set) {
        throw new Error("FieldLegend must be used inside <FieldSet>.")
      }
      return usePart(set, "legend", useIdProp(), undefined, "legend")
    },
  })
)

/**
 * Lays fields out. It has no role: a FieldSet is what names and disables a group.
 * @stable
 */
const FieldGroup = withElement(
  "div",
  defineComponent({
    name: "FieldGroup",
    inheritAttrs: false,
    slots: Object as PartSlots<typeof fieldGroupPrimitive, "group">,
    setup() {
      return usePart(
        usePrimitive(fieldGroupPrimitive, () => ({})),
        "group"
      )
    },
  })
)

export { useFieldControl } from "./field-context"

export {
  Field,
  FieldControl,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
}

export type {
  FieldApi,
  FieldDescriptionState,
  FieldErrorProps,
  FieldErrorState,
  FieldGroupPrimitive,
  FieldOptions,
  FieldPrimitive,
  FieldSetOptions,
  FieldSetPrimitive,
  FieldSetState,
  FieldState,
  ValidityKey,
} from "@ui-sdk/core/field"
