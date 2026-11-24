import type { PropsOf } from "@ui-sdk/core"
import {
  fieldGroup,
  field as fieldPrimitive,
  fieldSet,
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
import * as React from "react"
import { FieldContext, ownDescription } from "./field-context"
import {
  extendHandle,
  mergeProps,
  renderElement,
  usePart,
  usePrimitive,
  type PartProps,
  type PrimitiveHandle,
} from "./use-primitive"

type FieldHandle = PrimitiveHandle<typeof fieldPrimitive>
type FieldSetHandle = PrimitiveHandle<typeof fieldSet>

// What a FieldDescription describes: the nearest Field, or a FieldSet when no
// Field is closer.
const DescribedContext = React.createContext<
  FieldHandle | FieldSetHandle | null
>(null)

// Checks a part outside a field once it's in the page. Made once, so React
// keeps the same ref and hands the element over once.
const outsideRefs: Partial<
  Record<FieldOutsideSlot, (el: Element | null) => void>
> = {
  label: (el) =>
    checkFieldOutside(
      el,
      "label",
      "Put the control inside it, or point its `htmlFor` at the control."
    ),
  control: (el) => checkFieldOutside(el, "control"),
}

// A part outside any Field: a plain element with no field wiring, so a
// FieldLabel is a native <label> that labels the control it wraps.
function outside(
  slot: FieldOutsideSlot,
  tag: string,
  { render, ...props }: Record<string, any>
) {
  const ref = outsideRefs[slot]
  return renderElement(
    tag,
    mergeProps(fieldOutsideAttrs(slot), props, { ref }),
    render,
    fieldOutsideState
  )
}

// A part inside its field, as a component of its own, so whether a field is
// around a part never changes the order of its hooks.
function InField<S extends FieldOutsideSlot>({
  field,
  slot,
  part,
  props,
  tag,
}: {
  field: FieldHandle
  slot: S
  part: PropsOf<typeof fieldPrimitive, S>
  props: Record<string, any>
  tag: "label" | "p" | "div" | "input"
}) {
  return usePart(field, slot, part, props, tag)
}

/**
 * Ties a form control to its label, description and error messages.
 * @stable
 */
function Field({
  name,
  disabled,
  invalid,
  debug,
  ...props
}: FieldOptions & PartProps<"div", FieldState>) {
  const field = usePrimitive(fieldPrimitive, { name, disabled, invalid, debug })
  const context = React.useMemo(
    () => extendHandle(field, { name, disabled }),
    [field, name, disabled]
  )
  return (
    <FieldContext.Provider value={context}>
      <DescribedContext.Provider value={field}>
        {usePart(field, "root", {}, props, "div")}
      </DescribedContext.Provider>
    </FieldContext.Provider>
  )
}

// Field parts take the user's `id`, which names the part, as the slot's too.

/**
 * The field's label, which names its control. Outside a Field it's a plain
 * <label>, which labels the control inside it, like a card around a whole Field.
 * @stable
 */
function FieldLabel(props: PartProps<"label", FieldState>) {
  const field = React.useContext(FieldContext)
  if (!field) {
    return outside("label", "label", props)
  }
  return (
    <InField
      field={field}
      slot="label"
      part={{ id: props.id }}
      props={props}
      tag="label"
    />
  )
}

/**
 * Describes its Field. Right inside a FieldSet, outside any Field, it describes
 * the group, so screen readers say it as focus enters the group.
 * @stable
 */
function FieldDescription(props: PartProps<"p", FieldDescriptionState>) {
  const described = React.useContext(DescribedContext)
  const made = React.useId()
  if (!described) {
    return outside("description", "p", props)
  }
  // A field set's description slot takes the same props, and its state is the
  // `disabled` that FieldDescriptionState always has.
  const owner = described as FieldHandle
  return (
    <InField
      field={owner}
      slot="description"
      part={{ id: props.id, value: made }}
      props={props}
      tag="p"
    />
  )
}

/**
 * Shows while the field shows as invalid. Without children, it shows the
 * browser's message for the current problem.
 * @stable
 */
function FieldError({
  match,
  children = message,
  ...props
}: PartProps<"div", FieldErrorState> & FieldErrorProps) {
  const field = React.useContext(FieldContext)
  const made = React.useId()
  if (!field) {
    return fieldOutsideErrorShown({ match })
      ? outside("error", "div", { ...props, children })
      : null
  }
  // Each error is its own part, keyed by a made value. Core gives the first one
  // that shows the id the control points at before the field binds.
  return (
    <InField
      field={field}
      slot="error"
      part={{ id: props.id, value: made, match }}
      props={{ ...props, children }}
      tag="div"
    />
  )
}

const message = (state: FieldErrorState) => state.message

/**
 * A native control: an <input> by default, or anything through `render`.
 * @stable
 */
function FieldControl({
  name,
  render,
  ...rest
}: PartProps<"input", FieldState>) {
  const field = React.useContext(FieldContext)
  if (!field) {
    return outside("control", "input", { ...rest, name, render })
  }
  const [props, element] = ownDescription(rest, render)
  const control = { id: props.id, describedBy: props["aria-describedby"] }
  const user = { ...props, render: element, name: name ?? field.name }
  return (
    <InField
      field={field}
      slot="control"
      part={control}
      props={user}
      tag="input"
    />
  )
}

/**
 * A native <fieldset>, so `disabled` disables every control inside it.
 * @stable
 */
function FieldSet({
  disabled,
  debug,
  ...props
}: FieldSetOptions & Omit<PartProps<"fieldset", FieldSetState>, "disabled">) {
  const set = usePrimitive(fieldSet, { disabled, debug })
  return (
    <DescribedContext.Provider value={set}>
      {usePart(set, "set", {}, props, "fieldset")}
    </DescribedContext.Provider>
  )
}

/**
 * Names the field set. Keep it the set's first child, where a <legend> names it natively.
 * @stable
 */
function FieldLegend(props: PartProps<"legend", FieldSetState>) {
  return usePart(fieldSet, "legend", { id: props.id }, props, "legend")
}

/**
 * Lays fields out. It has no role: a FieldSet is what names and disables a group.
 * @stable
 */
function FieldGroup(props: PartProps<"div">) {
  return usePart(usePrimitive(fieldGroup, {}), "group", {}, props, "div")
}

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
