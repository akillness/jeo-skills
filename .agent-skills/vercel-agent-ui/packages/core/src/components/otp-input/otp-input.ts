import { warn } from "#dev"
import { css } from "../../foundation/kernel/inline-style"
import {
  badgeSpace,
  cleanCode,
  otpInputApi,
  isDisabled,
  settings,
  type OTPInputChangeOptions,
  type OTPInputOptions as Options,
  type State,
} from "./otp-input-api"
import {
  inputModeFor,
  patternAttribute,
  slotsOf,
  type OTPInputSlotData,
} from "./otp-input-model"
import { createController } from "../../foundation/kernel/controller"
import { definePrimitive } from "../../foundation/kernel/primitive"
import type { Named } from "../../foundation/kernel/primitive-types"

/**
 * Reads and writes the code from anywhere. Pass it as the `controller` option.
 * @stable
 */
function createOTPInputController() {
  return createController<{
    /** The code. */
    getValue: () => string
    /**
     * Sets the code, as typing it would. Characters that don't fit the pattern are dropped.
     * Returns false when the change was canceled or nothing changed.
     */
    setValue: (value: string, options?: OTPInputChangeOptions) => boolean
    /** Empties the code. Returns false when the change was canceled or nothing changed. */
    clear: (options?: OTPInputChangeOptions) => boolean
    /** Moves focus to the input. */
    focus: () => void
  }>()
}

/**
 * A controller from `createOTPInputController()`. Pass it as the `controller`
 * option.
 * @stable
 */
type OTPInputController = ReturnType<typeof createOTPInputController>

// Reads a custom element's `pattern` attribute: "digits", "letters" and
// "alphanumeric" are presets, and anything else is a regular expression each
// character must match, like "[A-F0-9]". One that doesn't compile falls back
// to digits rather than break the element.
function readPattern(attribute: string | null) {
  if (attribute === null) {
    return undefined
  }
  if (
    attribute === "digits" ||
    attribute === "letters" ||
    attribute === "alphanumeric"
  ) {
    return attribute
  }
  try {
    return new RegExp(attribute)
  } catch {
    warn(
      `pattern "${attribute}" isn't a valid regular expression, so it takes digits.`,
      {
        component: "otp-input",
      }
    )
    return "digits"
  }
}

/**
 * The options `otpInput` takes. A component takes them as props on its root.
 * @stable
 */
type OTPInputOptions = Omit<Options, "controller"> & {
  /** Reads and writes the code from anywhere. Create one with `createOTPInputController()`. */
  controller?: OTPInputController
}

/**
 * The props the `slot` slot of `otpInput` takes: one character's box.
 * @stable
 */
type OTPInputSlotProps = {
  /** Which character of the code the slot shows, from 0. */
  index: number
}

/**
 * What `render` functions and state-based class names receive.
 * @stable
 */
type OTPInputState = {
  /** The code. */
  value: string
  /** One entry per slot: its character, whether it's active, and whether it draws a caret. */
  slots: OTPInputSlotData[]
  /** Whether the input has focus. */
  focused: boolean
  /** Whether every slot is filled. */
  complete: boolean
  /** Whether it's disabled, by itself or by a `<fieldset>`. */
  disabled: boolean
}

/**
 * The state the `slot` slot of `otpInput` hands `render` functions and
 * state-based class names.
 * @stable
 */
type OTPInputSlotState = OTPInputSlotData & {
  /** Which character of the code the slot shows. */
  index: number
  /** Whether the input has focus. */
  focused: boolean
  /** Whether it's disabled, by itself or by a `<fieldset>`. */
  disabled: boolean
}

// The slots change with every key and caret move. Each state renders them
// once, so parts reading `slots` see the same array until something changes.
const slotCache = new WeakMap<State, OTPInputSlotData[]>()
function slotsFor(state: State) {
  let slots = slotCache.get(state)
  if (!slots) {
    slots = slotsOf(
      state.value,
      state.maxLength,
      state.focused ? state.selection : null
    )
    slotCache.set(state, slots)
  }
  return slots
}

function rootState(state: State) {
  return {
    value: state.value,
    slots: slotsFor(state),
    focused: state.focused,
    complete: state.value.length === state.maxLength,
    disabled: isDisabled(state),
  }
}

function rootAttrs(state: State) {
  return {
    "data-focused": state.focused ? "" : undefined,
    "data-complete": state.value.length === state.maxLength ? "" : undefined,
    "data-filled": state.value ? "" : undefined,
    "data-disabled": isDisabled(state) ? "" : undefined,
  }
}

// Invisible and over every slot, so a press anywhere focuses it, and as tall
// as the slots, so phones put their paste menu by them. 16px text keeps iOS
// from zooming in on focus. Squeezed letters keep the text from scrolling.
function inputStyle(state: State) {
  return css({
    position: "absolute",
    inset: 0,
    width: state.pushBadge ? `calc(100% + ${badgeSpace}px)` : "100%",
    height: "100%",
    "clip-path": state.pushBadge ? `inset(0 ${badgeSpace}px 0 0)` : undefined,
    margin: 0,
    padding: 0,
    border: 0,
    outline: "none",
    "box-shadow": "none",
    appearance: "none",
    background: "transparent",
    color: "transparent",
    "-webkit-text-fill-color": "transparent",
    "caret-color": "transparent",
    "font-size": "16px",
    "font-family": "monospace",
    "letter-spacing": "-0.5em",
    "text-align": state.textAlign,
  })
}

const otpInputPrimitive = /* @__PURE__ */ definePrimitive({
  name: "otp-input",
  options: {
    value: "string",
    defaultValue: "string",
    onValueChange: "callback",
    onValueCommit: "callback",
    maxLength: "number",
    pattern: readPattern,
    inputMode: "string",
    textAlign: "string",
    autoComplete: "string",
    disabled: "boolean",
    readOnly: "boolean",
    required: "boolean",
    name: "string",
    form: "string",
    controller: "value",
  },
  state: (options: OTPInputOptions) => {
    const base = settings(options)
    return {
      ...base,
      value: cleanCode(
        options.value ?? options.defaultValue ?? "",
        base.pattern,
        base.maxLength
      ),
      initial: cleanCode(
        options.defaultValue ?? "",
        base.pattern,
        base.maxLength
      ),
      formDisabled: false,
      tooShort: false,
      focused: false,
      selection: { start: 0, end: 0 },
      pushBadge: false,
    }
  },
  sync: (options) => {
    const base = settings(options)
    return {
      ...base,
      ...(options.defaultValue === undefined
        ? {}
        : {
            initial: cleanCode(
              options.defaultValue,
              base.pattern,
              base.maxLength
            ),
          }),
      ...(options.value === undefined
        ? {}
        : { value: cleanCode(options.value, base.pattern, base.maxLength) }),
    }
  },
  api: otpInputApi,
  slots: (slot) => ({
    // Holds the slots and the input over them.
    root: slot<{}, OTPInputState>({
      state: rootState,
      attrs: (state) => ({ ...rootAttrs(state), style: "position:relative" }),
    }),

    // The real input, which takes focus, holds the code and submits it.
    control: slot<{}, OTPInputState>({
      state: rootState,
      attrs: (state) => ({
        type: "text",
        value: state.value,
        maxlength: String(state.maxLength),
        // A partial code is too short to submit.
        minlength: String(state.maxLength),
        pattern: patternAttribute(
          state.pattern,
          state.maxLength,
          state.tooShort
        ),
        inputmode: state.inputMode ?? inputModeFor(state.pattern),
        autocomplete: state.autoComplete,
        autocorrect: "off",
        autocapitalize: "off",
        spellcheck: "false",
        name: state.name,
        form: state.form,
        disabled: state.disabled ? "" : undefined,
        readonly: state.readOnly ? "" : undefined,
        required: state.required ? "" : undefined,
        ...rootAttrs(state),
        style: inputStyle(state),
      }),
      bind: (el, { api }) => api.internal.bind(el as HTMLInputElement),
    }),

    // Lays out a run of slots. Like the slots, it's only drawn: the input is what's announced.
    group: slot<{}, OTPInputState>({
      state: rootState,
      attrs: (state) => ({ "aria-hidden": "true", ...rootAttrs(state) }),
    }),

    slot: slot<OTPInputSlotProps, OTPInputSlotState>({
      props: { index: "number" },
      state: (state, { props }) => {
        const index = props.index ?? 0
        return {
          ...(slotsFor(state)[index] ?? {
            char: null,
            active: false,
            hasFakeCaret: false,
          }),
          index,
          focused: state.focused,
          disabled: isDisabled(state),
        }
      },
      attrs: (state, { props }) => {
        const data = slotsFor(state)[props.index ?? 0]
        return {
          "aria-hidden": "true",
          "data-active": data?.active ? "" : undefined,
          "data-filled": data?.char ? "" : undefined,
          "data-fake-caret": data?.hasFakeCaret ? "" : undefined,
          "data-disabled": isDisabled(state) ? "" : undefined,
        }
      },
    }),

    // Drawn between groups, like a dash.
    separator: slot<{}, OTPInputState>({
      state: rootState,
      attrs: (state) => ({
        "aria-hidden": "true",
        "data-disabled": isDisabled(state) ? "" : undefined,
      }),
    }),
  }),
  agent: { actions: ["setValue", "clear"], secret: true },
})

/**
 * The type of `otpInput`.
 * @stable
 */
interface OtpInputPrimitive extends Named<typeof otpInputPrimitive> {}

/**
 * The otp input primitive, with the slots `root`, `control`, `group`, `slot`,
 * `separator`.
 * Render it with an adapter's `usePrimitive`, or compose it inside your own
 * primitive.
 * @stable
 */
const otpInput: OtpInputPrimitive = otpInputPrimitive

export {
  createOTPInputController,
  otpInput,
  type OTPInputController,
  type OTPInputOptions,
  type OtpInputPrimitive,
  type OTPInputSlotProps,
  type OTPInputSlotState,
  type OTPInputState,
}
export type {
  OTPInputApi,
  OTPInputChangeOptions,
  OTPInputValueChangeReason,
} from "./otp-input-api"
export type { OTPInputPattern, OTPInputSlotData } from "./otp-input-model"
