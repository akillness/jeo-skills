import {
  bindValueInput,
  bindInternals,
  takeTypedText,
} from "../../foundation/forms/form"
import {
  atBound,
  canStep,
  display,
  inputMode,
  isDisabled,
  numberInputApi,
  settings,
  type State,
} from "./number-input-api"
import { createController } from "../../foundation/kernel/controller"
import type {
  ChangeDetails,
  ChangeOptions,
  CommitDetails,
} from "../../foundation/kernel/details"
import { definePrimitive } from "../../foundation/kernel/primitive"
import type {
  Named,
  PrimitiveOptions,
} from "../../foundation/kernel/primitive-types"
import { orientationOf } from "../../foundation/focus/collection"
import { bindPageLocale, pageLocale } from "../../foundation/text/locale"
import { live } from "../../foundation/kernel/live"

/**
 * Why a number input's value wants to change.
 * @stable
 */
type NumberInputValueChangeReason =
  | "input-change"
  | "input-commit"
  | "step-key"
  | "increment-press"
  | "decrement-press"
  | "wheel"
  | "scrub"
  | "reset"
  | "restore"
  | "imperative"

/**
 * Options for every write method on a controller.
 * @stable
 */
type NumberInputChangeOptions = ChangeOptions<NumberInputValueChangeReason>

/**
 * Steps and inspects a number input from outside it. Pass it as the `controller` option.
 * @stable
 */
function createNumberInputController() {
  return createController<{
    /** The value, or null when the field is empty. */
    getValue: () => number | null
    /** Sets the value, as a user would. It's clamped and snapped to the step. */
    setValue: (
      value: number | null,
      options?: NumberInputChangeOptions
    ) => boolean
    /** Steps the value up, by `largeStep` with `{ large: true }`. */
    increment: (
      options?: NumberInputChangeOptions & { large?: boolean }
    ) => boolean
    /** Steps the value down, by `largeStep` with `{ large: true }`. */
    decrement: (
      options?: NumberInputChangeOptions & { large?: boolean }
    ) => boolean
    /** Moves focus to the input. */
    focus: () => void
  }>()
}

/**
 * A controller from `createNumberInputController()`. Pass it as the
 * `controller` option.
 * @stable
 */
type NumberInputController = ReturnType<typeof createNumberInputController>

// Reads a `value` or `default-value` attribute. An empty attribute, or one
// that isn't a number, is an empty field.
function valueAttribute(attribute: string | null) {
  if (attribute === null) {
    return undefined
  }
  const number = attribute.trim() === "" ? NaN : Number(attribute)
  return Number.isFinite(number) ? number : null
}

/**
 * The options `numberInput` takes. A component takes them as props on its
 * root.
 * @stable
 */
type NumberInputOptions = {
  /** The value, or null for an empty field. Pass it to control the field. */
  value?: number | null
  /**
   * The value at first, when uncontrolled. A form reset returns to it.
   * @defaultValue null
   */
  defaultValue?: number | null
  /** Runs when the value changes: as a typed number becomes valid, and on every step. `details.cancel()` stops it. */
  onValueChange?: (
    value: number | null,
    details: ChangeDetails<NumberInputValueChangeReason>
  ) => void
  /** Runs once an interaction that changed the value ends: typing is committed, a key or a button is released, or a scrub ends. For saving. */
  onValueCommit?: (
    value: number | null,
    details: CommitDetails<NumberInputValueChangeReason>
  ) => void
  /** The lowest value. Typed values below it are raised to it when committed. */
  min?: number
  /** The highest value. Typed values above it are lowered to it when committed. */
  max?: number
  /**
   * How far one step moves. Committed values snap to steps from `min`, or from 0 without one.
   * @defaultValue 1, or the smallest percent a percent format shows, like 0.01
   */
  step?: number
  /**
   * How far Page Up, Page Down, and Shift with an arrow key, a button, the wheel or a scrub move.
   * @defaultValue 10 steps
   */
  largeStep?: number
  /**
   * How far Alt (Option on a Mac) with an arrow key, the wheel or a scrub moves, for fine changes.
   * Values it reaches snap to it rather than to `step`.
   * @defaultValue a tenth of a step
   */
  smallStep?: number
  /**
   * How the value shows: `Intl.NumberFormat` options, like `{ style: "currency", currency: "USD" }`.
   * Typing accepts the same format in the locale, and percents are fractions: 50% is 0.5.
   */
  format?: Intl.NumberFormatOptions
  /**
   * The locale for formatting and reading typed numbers. Defaults to the
   * page's `lang`, or the browser's language without one, once the page is
   * interactive. Server markup uses English until then, so it never disagrees
   * with the client.
   */
  locale?: string
  /**
   * Lets the mouse wheel step the value while the input has focus.
   * @defaultValue false
   */
  wheel?: boolean
  /** Disables it like a native control: it can't be focused or changed, and isn't submitted. */
  disabled?: boolean
  /** Keeps it focusable and submitted, but stops changes. */
  readOnly?: boolean
  /** Blocks form submission while it's empty, with the browser's own message. */
  required?: boolean
  /** The name it submits under. The number is submitted as is, like `1234.5`, never formatted. */
  name?: string
  /** The id of a form to belong to, when it isn't inside that form. */
  form?: string
  /** Steps it from anywhere. Create one with `createNumberInputController()`. */
  controller?: NumberInputController
} & PrimitiveOptions

/** What adapters pass on top: the id the field around it gives its control. */
type NumberInputInternalOptions = NumberInputOptions & { controlId?: string }

/**
 * The props the `scrub-area` slot of `numberInput` takes.
 * @stable
 */
type NumberInputScrubAreaProps = {
  /**
   * Which way to drag: right and up increase.
   * @defaultValue "horizontal"
   */
  orientation?: "horizontal" | "vertical"
  /**
   * How far the pointer moves for one step, in CSS pixels.
   * @defaultValue 2
   */
  pixelsPerStep?: number
  /**
   * Connects a scrub area outside the number input, like an icon in a toolbar,
   * to the number input with this controller. Inside it, it connects on its own.
   * Web components use `for="<number input id>"` instead.
   */
  controller?: NumberInputController
}

/**
 * The props the `increment` and `decrement` slots of `numberInput` take.
 * @stable
 */
type NumberInputButtonProps = {
  /** Turns off this button alone. Pressing, clicking or holding it doesn't step. */
  disabled?: boolean
}

/**
 * The state the `root` slot of `numberInput` hands `render` functions and
 * state-based class names.
 * @stable
 */
type NumberInputState = {
  /** The value, or null when empty. */
  value: number | null
  /** Whether it's disabled, by itself or by a `<fieldset>`. */
  disabled: boolean
  /** Whether it's read-only: it stays focusable and submitted, but typing, steps and scrubs don't change it. */
  readOnly: boolean
  /** Whether a form won't submit while it's empty. */
  required: boolean
  /** Whether a scrub is moving the value. */
  scrubbing: boolean
}
/**
 * The state the `increment` and `decrement` slots of `numberInput` hand
 * `render` functions and state-based class names.
 * @stable
 */
type NumberInputButtonState = NumberInputState & {
  /** Whether the button can't step, because it or the field is disabled, the field is read-only, or the value is at its bound. */
  disabled: boolean
  /** Whether the value is at the bound this button steps toward, like the maximum for the increment. */
  atBound: boolean
}

function fieldState(state: State) {
  return {
    value: state.value,
    disabled: isDisabled(state),
    readOnly: state.readOnly,
    required: state.required,
    scrubbing: state.scrubbing,
  }
}

function dataAttrs(state: State) {
  return {
    "data-disabled": isDisabled(state) ? "" : undefined,
    "data-readonly": state.readOnly ? "" : undefined,
    "data-required": state.required ? "" : undefined,
    "data-scrubbing": state.scrubbing ? "" : undefined,
  }
}

const controlIdOf = (state: State, id: string) =>
  state.controlId ?? `${id}-control`

// Whether a step button can't step: it's disabled itself, or the field can't step that way.
function isBlocked(
  state: State,
  props: NumberInputButtonProps,
  direction: number
) {
  return !!props.disabled || !canStep(state, direction)
}

function button(direction: number) {
  return {
    state: (state: State, { props }: { props: NumberInputButtonProps }) => ({
      ...fieldState(state),
      disabled: isBlocked(state, props, direction),
      atBound: atBound(state, direction),
    }),
    attrs: (
      state: State,
      { id, props }: { id: string; props: NumberInputButtonProps }
    ) => {
      const blocked = isBlocked(state, props, direction)
      return {
        type: "button",
        tabindex: "-1",
        "aria-controls": controlIdOf(state, id),
        // Read-only buttons stay in the page as they were, but do nothing.
        disabled:
          props.disabled || (blocked && !state.readOnly) ? "" : undefined,
        "aria-disabled": blocked ? "true" : undefined,
        ...dataAttrs(state),
        "data-disabled": blocked ? "" : undefined,
        "data-at-bound": atBound(state, direction) ? "" : undefined,
        style:
          "user-select:none;-webkit-user-select:none;touch-action:manipulation",
      }
    },
  }
}

const numberInputPrimitive = /* @__PURE__ */ definePrimitive({
  name: "number-input",
  options: {
    value: valueAttribute,
    defaultValue: valueAttribute,
    onValueChange: "callback",
    onValueCommit: "callback",
    min: "number",
    max: "number",
    step: "number",
    largeStep: "number",
    smallStep: "number",
    format: "value",
    locale: "string",
    wheel: "boolean",
    disabled: "boolean",
    readOnly: "boolean",
    required: "boolean",
    name: "string",
    form: "string",
    controller: "value",
    // Internal: passed by renderers.
    controlId: "string",
  },
  state: (options: NumberInputInternalOptions): State => {
    const value =
      options.value !== undefined
        ? options.value
        : (options.defaultValue ?? null)
    const base = { ...settings(options), pageLocale: null }
    return {
      ...base,
      value,
      initial: options.defaultValue ?? value,
      text: display(value, base),
      formDisabled: false,
      controlId: options.controlId ?? null,
      scrubbing: false,
      platform: "other",
      cursor: null,
    }
  },
  live: ["cursor"],
  sync: (options) => ({
    ...settings(options),
    ...(options.defaultValue === undefined
      ? {}
      : { initial: options.defaultValue }),
    ...(options.value === undefined ? {} : { value: options.value }),
    ...(options.controlId === undefined
      ? {}
      : { controlId: options.controlId }),
  }),
  commits: ["value"],
  api: numberInputApi,
  slots: (slot) => ({
    root: slot<{}, NumberInputState>({
      state: fieldState,
      attrs: dataAttrs,
      bind: (el, { api, store }) => {
        bindPageLocale(el, (pageLocale) => store.set({ pageLocale }))
        return bindInternals(el, {
          // A field can disable it without the `disabled` attribute the browser
          // leaves a control out of the form by, so disabled it submits nothing.
          value: () =>
            isDisabled(store.get()) ? null : api.internal.submitted(),
          state: () => String(store.get().value ?? ""),
          restore: api.internal.restore,
          // The input inside validates itself, so the field reports only its value.
          valueMissing: () => false,
          message: () => "",
          focus: api.focus,
          reset: api.internal.reset,
          disabled: api.internal.setFormDisabled,
          subscribe: store.subscribe,
        })
      },
    }),

    // Holds the input and its buttons.
    group: slot<{}, NumberInputState>({
      role: "group",
      state: fieldState,
      attrs: dataAttrs,
    }),

    control: slot<{}, NumberInputState>({
      state: fieldState,
      attrs: (state, { id }) => ({
        type: "text",
        id: controlIdOf(state, id),
        value: state.text,
        inputmode: inputMode(state),
        autocomplete: "off",
        autocorrect: "off",
        spellcheck: "false",
        required: state.required ? "" : undefined,
        disabled: state.disabled ? "" : undefined,
        readonly: state.readOnly ? "" : undefined,
        ...dataAttrs(state),
      }),
      on: {
        input: (event, { api, el }) =>
          el && api.internal.type((el as HTMLInputElement).value, event),
        keydown: (event, { api }) => api.internal.keydown(event),
        keyup: (event, { api }) => api.internal.keyup(event),
        focusout: (event, { api }) => api.internal.commitText(event),
      },
      bind: (el, { api, store }) => {
        const input = el as HTMLInputElement
        api.internal.readPlatform()
        // The text is written here, so the framework never fights the caret.
        const write = () => {
          if (input.value !== store.get().text) {
            input.value = store.get().text
          }
        }
        takeTypedText(
          input,
          () => [store.get().text],
          () => {
            // The root reads the page's language after its parts bind, and the text parses in it.
            if (store.get().pageLocale === null) {
              store.set({ pageLocale: pageLocale(input) ?? null })
            }
            api.internal.type(input.value)
            if (!input.matches(":focus")) {
              api.internal.commitText()
            }
          }
        )
        write()
        // React's wheel listeners are passive, and its beforeinput isn't the
        // native event, so the field listens itself.
        const onWheel = (event: WheelEvent) => {
          if (!event.defaultPrevented) {
            api.internal.wheel(event, input)
          }
        }
        const onBeforeInput = (event: InputEvent) => {
          if (!event.defaultPrevented) {
            api.internal.beforeinput(event, input)
          }
        }
        input.addEventListener("wheel", onWheel, { passive: false })
        input.addEventListener("beforeinput", onBeforeInput)
        const cleanups = [
          store.subscribe(write),
          () => input.removeEventListener("wheel", onWheel),
          () => input.removeEventListener("beforeinput", onBeforeInput),
        ]
        return () => cleanups.forEach((cleanup) => cleanup())
      },
    }),

    increment: slot<NumberInputButtonProps, NumberInputButtonState>({
      props: { disabled: "boolean" },
      ...button(1),
      on: {
        click: (event, { api, props }) =>
          !props.disabled && api.internal.clickButton(event, 1),
      },
      bind: (el, part) =>
        part.api.internal.bindButton(el, 1, () => !!part.props.disabled),
    }),

    decrement: slot<NumberInputButtonProps, NumberInputButtonState>({
      props: { disabled: "boolean" },
      ...button(-1),
      on: {
        click: (event, { api, props }) =>
          !props.disabled && api.internal.clickButton(event, -1),
      },
      bind: (el, part) =>
        part.api.internal.bindButton(el, -1, () => !!part.props.disabled),
    }),

    // Drag across it to change the value, like a label in a design tool. The
    // mouse is locked once the press becomes a drag, where the browser allows
    // it, so the drag never runs out of screen. Any number of them, anywhere
    // inside the root or connected from outside it, drive one input.
    "scrub-area": slot<
      Omit<NumberInputScrubAreaProps, "controller">,
      NumberInputState
    >({
      props: { orientation: "string", pixelsPerStep: "number" },
      state: fieldState,
      attrs: (state, { props }) => ({
        ...dataAttrs(state),
        "data-orientation": orientationOf(props.orientation, "horizontal"),
        style: "touch-action:none;user-select:none;-webkit-user-select:none",
      }),
      on: {
        pointerdown: (event, { api, el, props }) =>
          el && api.internal.scrub(event, el, props),
      },
    }),

    // Stands in for the mouse cursor while the pointer is locked.
    "scrub-area-cursor": slot<{}, NumberInputState>({
      present: (state) => state.scrubbing,
      state: fieldState,
      attrs: dataAttrs,
      live: live((state) => ({
        style: state.cursor
          ? `position:fixed;top:0;left:0;pointer-events:none;translate:${state.cursor.x}px ${state.cursor.y}px`
          : "position:fixed;top:0;left:0;pointer-events:none;visibility:hidden",
      })),
    }),

    // React and Vue: the hidden input the form submits.
    "hidden-input": slot({
      attrs: (state) => ({
        type: "hidden",
        name: state.name,
        value: state.value === null ? "" : String(state.value),
        form: state.form,
        disabled: state.disabled ? "" : undefined,
      }),
      bind: (el, { api, store }) =>
        bindValueInput(el as HTMLInputElement, {
          value: () =>
            store.get().value === null ? "" : String(store.get().value),
          subscribe: store.subscribe,
          focus: api.focus,
          reset: api.internal.reset,
          disabled: api.internal.setFormDisabled,
        }),
    }),
  }),
  agent: { actions: ["setValue", "increment", "decrement"] },
})

/**
 * The type of `numberInput`.
 * @stable
 */
interface NumberInputPrimitive extends Named<typeof numberInputPrimitive> {}

/**
 * The number input primitive, with the slots `root`, `group`, `control`,
 * `increment`, `decrement`, `scrub-area`, `scrub-area-cursor`, `hidden-input`.
 * Render it with an adapter's `usePrimitive`, or compose it inside your own
 * primitive.
 * @stable
 */
const numberInput: NumberInputPrimitive = numberInputPrimitive

export {
  createNumberInputController,
  numberInput,
  type NumberInputButtonProps,
  type NumberInputButtonState,
  type NumberInputChangeOptions,
  type NumberInputController,
  type NumberInputOptions,
  type NumberInputPrimitive,
  type NumberInputScrubAreaProps,
  type NumberInputState,
  type NumberInputValueChangeReason,
}
export type { NumberInputApi } from "./number-input-api"
