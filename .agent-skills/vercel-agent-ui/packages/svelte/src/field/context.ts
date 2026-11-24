import type { field, fieldSet } from "@ui-sdk/core/field"
import {
  checkFieldOutside,
  fieldControlId,
  fieldOutsideAttrs,
  fieldOutsideState,
  type FieldOutsideSlot,
  madeLabel,
} from "@ui-sdk/core/renderer"
import { getContext } from "svelte"
import { createAttachmentKey } from "svelte/attachments"
import {
  plainPart,
  useHandlePart,
  type PrimitiveHandle,
  type SlotAttributes,
} from "../use-primitive.svelte"

type FieldContext = PrimitiveHandle<typeof field> & {
  name: () => string | undefined
  disabled: () => boolean | undefined
}

type FieldSetContext = PrimitiveHandle<typeof fieldSet>

const FieldKey = Symbol("field")
const FieldSetKey = Symbol("field-set")
// What a FieldDescription describes: the nearest Field, or a FieldSet when no
// Field is closer.
const DescribedKey = Symbol("field-described")

// The field around a part, or undefined outside any.
const useField = () => getContext<FieldContext | undefined>(FieldKey)

// Checks a part outside a field once it's in the page. Made once, so Svelte
// attaches each element once, and in a pure call, so a control that only
// imports useFieldControl doesn't bundle the checks.
const outsideChecks: Partial<Record<FieldOutsideSlot, SlotAttributes>> =
  /* @__PURE__ */ (() => ({
    label: {
      [createAttachmentKey()]: (el: HTMLElement) =>
        checkFieldOutside(el, "label"),
    },
    control: {
      [createAttachmentKey()]: (el: HTMLElement) =>
        checkFieldOutside(el, "control"),
    },
  }))()

// A part outside any Field: a plain element with no field wiring, so a
// FieldLabel is a native <label> that labels the control it wraps.
const outsidePart = (slot: FieldOutsideSlot) =>
  plainPart(fieldOutsideState, {
    ...fieldOutsideAttrs(slot),
    ...outsideChecks[slot],
  })

/**
 * Controls inside a field take its name and disabled state, and its ids and
 * validity through the field's control slot. Null outside a field. Call it
 * in the control's script, before its own primitive, since the options read
 * the field's name.
 * @stable
 */
function useFieldControl() {
  const field = getContext<FieldContext | undefined>(FieldKey)
  if (!field) {
    return null
  }
  return {
    name: field.name,
    disabled: field.disabled,
    // The field's part for its control, keyed by the id the control's author
    // gave. Without one, the control takes the field's, so the label points
    // at it from the server's HTML on. Call it once in the control's script.
    // The function it returns merges the field's attributes into the
    // control's props, which stays its own part for styling, and the field
    // decides the id. `describedBy` is the control's own description, which
    // stays ahead of the field's.
    control(
      id: () => string | null | undefined,
      describedBy?: () => string | null | undefined
    ) {
      const part = useHandlePart(field, "control", () => ({
        id: id() ?? undefined,
        describedBy: describedBy?.() ?? undefined,
      }))
      // The field's label names the control over the control's own, like a ComboboxLabel's, but not over the author's.
      // check-code: allow return-type the spread drops SlotAttributes' index signatures, so callers would lose its attachments.
      return (props: SlotAttributes): SlotAttributes => {
        const label = props["aria-labelledby"]
        const merged = part.slot({
          ...props,
          id: undefined,
          "aria-labelledby": madeLabel(label) ? undefined : label,
        })
        return {
          ...merged,
          "aria-labelledby": merged["aria-labelledby"] ?? label,
          "data-slot": props["data-slot"],
        }
      }
    },
  }
}

function useFieldControlId() {
  const field = useField()
  return field ? fieldControlId(field.api.id) : undefined
}

export {
  DescribedKey,
  type FieldContext,
  FieldKey,
  type FieldSetContext,
  FieldSetKey,
  outsidePart,
  useField,
  useFieldControl,
  useFieldControlId,
}
