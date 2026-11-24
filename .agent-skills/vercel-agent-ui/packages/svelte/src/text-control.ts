import type { ChangeDetails } from "@ui-sdk/core"
import type {
  InputController,
  InputValueChangeReason,
} from "@ui-sdk/core/input"
import type { Snippet } from "svelte"
import type { SvelteHTMLElements } from "svelte/elements"
import type { useFieldControl } from "./field/context"
import type { SlotAttributes } from "./use-primitive.svelte"

/**
 * Props Input and Textarea share: the text, its native states and the controller.
 * @stable
 */
type TextControlProps = {
  /** The text. Bind it with `bind:value` to control the field. */
  value?: string
  /** The text at first, when uncontrolled. A form reset returns to it. */
  defaultValue?: string
  /** Disables the field. Inside a Field, the Field's `disabled` applies too. */
  disabled?: boolean
  /** Makes the field read-only. A native `readonly` attribute does the same. */
  readOnly?: boolean
  /** Makes the field required. */
  required?: boolean
  /** Reads and writes the field from anywhere. Create one with `createInputController()`. */
  controller?: InputController
  /** Logs every change with its reason. */
  debug?: boolean
  /**
   * Runs when the user types (`"input-change"`), a Clear part empties the
   * field (`"clear-press"`), a form resets (`"reset"`) or a controller writes
   * (`"imperative"`). `details.cancel()` keeps the text as it was.
   */
  onValueChange?: (
    value: string,
    details: ChangeDetails<InputValueChangeReason>
  ) => void
}

/**
 * The element's props for a text field: its attributes, less `value` and
 * `defaultValue`, which the field types as strings, plus `render` and
 * `children`.
 */
type TextPartProps<Tag extends "input" | "textarea", State> = Omit<
  SvelteHTMLElements[Tag],
  "children" | "value" | "defaultValue" | "defaultvalue"
> & { [attribute: string]: unknown } & {
  /** Renders your own element. Receives the props to spread on it and the part's state. */
  render?: Snippet<
    [{ props: SlotAttributes; state: State; children?: Snippet<[State]> }]
  >
  /** Content. Receives the part's state. */
  children?: Snippet<[State]>
}

type Field = ReturnType<typeof useFieldControl>

type NativeStates = Pick<TextControlProps, "disabled" | "readOnly" | "required">

/** Whether a field is read-only: its `readOnly` prop, or else a native `readonly` attribute among its other props. */
function readOnlyOf(
  readOnly: boolean | undefined,
  attributes: Record<string, unknown>
) {
  if (readOnly !== undefined) {
    return readOnly
  }
  const native = attributes.readonly
  return native !== undefined && native !== null && native !== false
}

/** The native states a text field's part attributes follow, from its own props and its field's. */
function controlProps(
  props: NativeStates,
  field: Field,
  attributes: Record<string, unknown>
) {
  return {
    disabled: props.disabled || field?.disabled(),
    readOnly: readOnlyOf(props.readOnly, attributes),
    required: props.required,
  }
}

/**
 * The element's attributes: the field's name, the user's, and the native
 * states. Each state is set or absent, never false, so the server omits it too.
 */
function elementProps(
  props: NativeStates,
  field: Field,
  attributes: Record<string, unknown>
) {
  const states = controlProps(props, field, attributes)
  return {
    name: field?.name(),
    ...attributes,
    disabled: states.disabled || undefined,
    readonly: states.readOnly || undefined,
    required: states.required || undefined,
  }
}

export {
  controlProps,
  elementProps,
  readOnlyOf,
  type TextControlProps,
  type TextPartProps,
}
