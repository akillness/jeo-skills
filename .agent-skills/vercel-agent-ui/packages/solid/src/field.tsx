import {
  fieldGroup as fieldGroupPrimitive,
  field as fieldPrimitive,
  fieldSet as fieldSetPrimitive,
  type FieldDescriptionState,
  type FieldErrorProps,
  type FieldErrorState,
  type FieldOptions,
  type FieldSetOptions,
  type FieldSetState,
  type FieldState,
} from "@ui-sdk/core/field"
import {
  checkFieldOutside,
  fieldOutsideAttrs,
  fieldOutsideErrorShown,
  fieldOutsideState,
  type FieldOutsideSlot,
} from "@ui-sdk/core/renderer"
import {
  createContext,
  createUniqueId,
  merge,
  omit,
  onSettled,
  Show,
  untrack,
  useContext,
} from "solid-js"
import { FieldContext, type FieldContextValue } from "./field-context"
import {
  renderStatic,
  rootScope,
  usePart,
  usePrimitive,
  type PartProps,
  type PrimitiveHandle,
} from "./use-primitive"

type FieldHandle = PrimitiveHandle<typeof fieldPrimitive>
type FieldSetHandle = PrimitiveHandle<typeof fieldSetPrimitive>

const FieldSetContext = createContext<FieldSetHandle | null>(null)
// What a FieldDescription describes: the nearest Field, or a FieldSet when no
// Field is closer.
const DescribedContext = createContext<FieldHandle | FieldSetHandle | null>(
  null
)

// Checks a part outside a field once its component settles, so a label
// behind a pending boundary is in the page by then.
const outsideRefs: Partial<Record<FieldOutsideSlot, (el: Element) => void>> = {
  label: (el) => checkFieldOutside(el, "label"),
  control: (el) => checkFieldOutside(el, "control"),
}

// A part outside any Field: a plain element with no field wiring, so a
// FieldLabel is a native <label> that labels the control it wraps.
function outside(
  slot: FieldOutsideSlot,
  tag: string,
  props: Record<string, any>
) {
  const check = outsideRefs[slot]
  let el: Element | undefined
  if (check) {
    onSettled(() => void (el && check(el)))
  }
  const ref = (node: Element) => void (el = node)
  const userRef = untrack(() => props.ref)
  const user = check
    ? merge(props, { ref: userRef ? [userRef, ref] : ref })
    : props
  return renderStatic(
    tag,
    () => ({ attrs: fieldOutsideAttrs(slot), state: fieldOutsideState }),
    user
  )
}

/**
 * Ties a form control to its label, description and error messages.
 * @stable
 */
const Field = /* @__PURE__ */ rootScope(function Field(
  props: FieldOptions & PartProps<"div", FieldState>
) {
  const field = usePrimitive(fieldPrimitive, () => ({
    name: props.name,
    disabled: props.disabled,
    invalid: props.invalid,
    debug: props.debug,
  }))
  const rest = omit(props, "name", "disabled", "invalid", "debug")
  // The handle with the field's name and disabled state beside it. Its
  // prototype keeps the handle's `state` getter live.
  const context: FieldContextValue = Object.assign(Object.create(field), {
    name: () => props.name,
    disabled: () => props.disabled,
  })
  return (
    <FieldContext value={context}>
      <DescribedContext value={field}>
        {usePart(field, "root", undefined, rest, "div")}
      </DescribedContext>
    </FieldContext>
  )
})

/**
 * The field's label, which names its control. Outside a Field it's a plain
 * <label>, which labels the control inside it, like a card around a whole Field.
 * @stable
 */
function FieldLabel(props: PartProps<"label", FieldState>) {
  const field = useContext(FieldContext)
  if (!field) {
    return outside("label", "label", props)
  }
  return usePart(
    field,
    "label",
    () => ({ id: props.id as string | undefined }),
    props,
    "label"
  )
}

/**
 * Describes its Field. Right inside a FieldSet, outside any Field, it describes
 * the group, so screen readers say it as focus enters the group.
 * @stable
 */
function FieldDescription(props: PartProps<"p", FieldDescriptionState>) {
  const described = useContext(DescribedContext)
  const made = createUniqueId()
  if (!described) {
    return outside("description", "p", props)
  }
  // A field set's description slot takes the same props, and its state is the
  // `disabled` that FieldDescriptionState always has.
  const owner = described as FieldHandle
  return usePart(
    owner,
    "description",
    () => ({ id: props.id as string | undefined, value: made }),
    props,
    "p"
  )
}

/**
 * Shows while the field shows as invalid. Without children, it shows the
 * browser's message for the current problem.
 * @stable
 */
function FieldError(
  props: PartProps<"div", FieldErrorState> & FieldErrorProps
) {
  const field = useContext(FieldContext)
  const made = createUniqueId()
  const rest = merge(omit(props, "match"), {
    get children() {
      return props.children ?? ((state: FieldErrorState) => state.message)
    },
  })
  if (!field) {
    return (
      <Show when={fieldOutsideErrorShown({ match: props.match })}>
        {outside("error", "div", rest)}
      </Show>
    )
  }
  // Each error is its own part, keyed by a made value. Core gives the first one
  // that shows the id the control points at before the field binds.
  const error = () => ({
    id: props.id as string | undefined,
    value: made,
    match: props.match,
  })
  return usePart(field, "error", error, rest, "div")
}

/**
 * A native control: an <input> by default, or anything through `render`.
 * @stable
 */
function FieldControl(props: PartProps<"input", FieldState>) {
  const field = useContext(FieldContext)
  if (!field) {
    return outside("control", "input", props)
  }
  const user = merge(omit(props, "name"), {
    get name() {
      return props.name ?? field.name()
    },
  })
  const control = () => ({
    id: props.id as string | undefined,
    describedBy: props["aria-describedby"] as string | undefined,
  })
  return usePart(field, "control", control, user, "input")
}

/**
 * A native <fieldset>, so `disabled` disables every control inside it.
 * @stable
 */
const FieldSet = /* @__PURE__ */ rootScope(function FieldSet(
  props: FieldSetOptions &
    Omit<PartProps<"fieldset", FieldSetState>, "disabled">
) {
  const set = usePrimitive(fieldSetPrimitive, () => ({
    disabled: props.disabled,
    debug: props.debug,
  }))
  const rest = omit(props, "disabled", "debug")
  return (
    <FieldSetContext value={set}>
      <DescribedContext value={set}>
        {usePart(set, "set", undefined, rest, "fieldset")}
      </DescribedContext>
    </FieldSetContext>
  )
})

/**
 * Names the field set. Keep it the set's first child, where a <legend> names it natively.
 * @stable
 */
function FieldLegend(props: PartProps<"legend", FieldSetState>) {
  const set = useContext(FieldSetContext)
  if (!set) {
    throw new Error("FieldLegend must be used inside <FieldSet>.")
  }
  return usePart(
    set,
    "legend",
    () => ({ id: props.id as string | undefined }),
    props,
    "legend"
  )
}

/**
 * Lays fields out. It has no role: a FieldSet is what names and disables a group.
 * @stable
 */
const FieldGroup = /* @__PURE__ */ rootScope(function FieldGroup(
  props: PartProps<"div">
) {
  return usePart(
    usePrimitive(fieldGroupPrimitive, () => ({})),
    "group",
    undefined,
    props,
    "div"
  )
})

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
export { useFieldControl } from "./field-context"
