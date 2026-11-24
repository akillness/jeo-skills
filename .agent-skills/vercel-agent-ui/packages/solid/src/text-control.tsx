import type { ChangeDetails } from "@ui-sdk/core"
import type { InputValueChangeReason } from "@ui-sdk/core/input"
import { isServer } from "@solidjs/web"
import { merge, omit, untrack } from "solid-js"
import type { useFieldControl } from "./field-context"
import type { PartProps } from "./use-primitive"

// Props an input or textarea takes that the part replaces.
type Native<Tag extends "input" | "textarea", State> = Omit<
  PartProps<Tag, State>,
  "value" | "defaultValue" | "onSelect"
>

// A boolean attribute as Solid types it: `true` and `""` set it.
const isSet = (value: unknown) =>
  value !== undefined && value !== null && value !== false

// The native props a text field's state follows, in Solid's casing.
type TextProps = { disabled?: unknown; readonly?: unknown; required?: unknown }

// The states a text field's attributes follow, from its own props and its field's.
function controlProps(
  props: TextProps,
  field: ReturnType<typeof useFieldControl>
) {
  return () => ({
    disabled: isSet(props.disabled) || !!field?.disabled(),
    readOnly: isSet(props.readonly),
    required: isSet(props.required),
  })
}

// The value as Solid writes it. A controlled value is the `value` property,
// which Solid writes on every render, so the key exists only while the
// field is controlled: an undefined one would empty the field. A default is
// what a form reset returns to and what the server renders: `defaultValue`
// on the client, and the `value` attribute on the server, which only knows
// attributes. A textarea's default is its text either way.
function valueProps(
  value: () => string | undefined,
  defaultValue: () => string | undefined
) {
  return () => {
    if (isServer) {
      return { value: value() ?? defaultValue() }
    }
    return value() === undefined
      ? { defaultValue: defaultValue() }
      : { value: value() }
  }
}

// Solid writes `value` only when it changes, so a controlled value the parent
// kept goes back once the change settles, as in React.
function keepControlled(
  value: () => string | undefined,
  onValueChange?: (
    value: string,
    details: ChangeDetails<InputValueChangeReason>
  ) => void
) {
  return (next: string, details: ChangeDetails<InputValueChangeReason>) => {
    onValueChange?.(next, details)
    const event = details.event as InputEvent | undefined
    const el = event?.target as HTMLInputElement | null | undefined
    // Mid-composition the IME owns the text, and its last change comes after.
    if (details.canceled || !el || event?.isComposing) {
      return
    }
    queueMicrotask(() => {
      const kept = untrack(value)
      if (kept !== undefined && el.value !== kept) {
        el.value = kept
      }
    })
  }
}

// The element's props: the field's name, the user's props and the value.
function elementProps(
  props: Record<string, any>,
  field: ReturnType<typeof useFieldControl>,
  value: () => string | undefined,
  defaultValue: () => string | undefined
) {
  return merge(
    props,
    {
      get name() {
        return props.name ?? field?.name()
      },
    },
    valueProps(value, defaultValue)
  )
}

// Core writes the text of a number input's or an OTP input's control itself,
// and the `value` in its attributes is where the text starts, for the server.
// On the client, Solid would write it as the live value on every render, over
// what the user typed since, so it becomes `defaultValue`: the `value`
// attribute, which a form reset returns to.
function defaultValueProps(
  props: Record<string, any>,
  initial: () => unknown = () => props.value
) {
  if (isServer) {
    return props
  }
  return merge(omit(props, "value"), {
    get defaultValue() {
      return initial()
    },
  })
}

/**
 * A number or date input's props for `usePart`, rendered with its text where
 * it starts, after the field's: core writes the text as it changes, so Solid
 * mustn't write it again (see `defaultValueProps`). Then the user's `render`
 * renders them.
 */
function startingText(props: Record<string, any>) {
  const render = untrack(() => props.render)
  return merge(props, {
    render: (merged: Record<string, any>, state: unknown) => {
      const element = defaultValueProps(merged)
      if (typeof render === "function") {
        return render(element, state)
      }
      return <input {...element} />
    },
  })
}

export {
  controlProps,
  defaultValueProps,
  elementProps,
  keepControlled,
  type Native,
  startingText,
  valueProps,
}
