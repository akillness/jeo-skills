import {
  watchValue,
  writeValue,
  type TextControl,
} from "../../foundation/forms/value"
import { watchFieldsets } from "../../foundation/forms/form"
import { createController } from "../../foundation/kernel/controller"
import type { ChangeOptions } from "../../foundation/kernel/details"
import { definePrimitive } from "../../foundation/kernel/primitive"
import type {
  Named,
  PrimitiveOptions,
} from "../../foundation/kernel/primitive-types"
import {
  focusFromSurroundings,
  initialText,
  syncText,
  textFields,
  textFieldApi,
  type InputValueChangeReason,
  type TextFieldOptions,
  type TextState,
} from "../../foundation/forms/text-field"
import { select } from "../../foundation/kernel/selects"
import { createChange, inputSource } from "../../foundation/kernel/input-source"
import { isApple } from "../../foundation/platform/platform"

/**
 * Reads and writes a text field from anywhere. Pass it as the `controller` option.
 * @stable
 */
function createInputController() {
  return createController<{
    /** The current value. */
    getValue: () => string
    /**
     * Sets the value as if the user typed it, so `input` fires.
     * Returns false when the change was canceled or nothing changed.
     */
    setValue: (
      value: string,
      options?: ChangeOptions<InputValueChangeReason>
    ) => boolean
    /**
     * Empties the field, as if the user deleted the text, so `input` fires.
     * Returns false when the change was canceled or nothing changed.
     */
    clear: (options?: ChangeOptions<InputValueChangeReason>) => boolean
    /** Moves focus to the field. */
    focus: () => void
  }>()
}

/**
 * A controller from `createInputController()`. Pass it as the `controller`
 * option.
 * @stable
 */
type InputController = ReturnType<typeof createInputController>

/**
 * The options `input` takes. A component takes them as props on its root.
 * @stable
 */
type InputOptions = TextFieldOptions & {
  /** Reads and writes the field from anywhere. Create one with `createInputController()`. */
  controller?: InputController
} & PrimitiveOptions

/**
 * What `onSubmit` of `textarea` receives besides the value.
 * @stable
 */
type TextareaSubmitDetails = {
  /** The key press that submitted. */
  event?: Event
}

/**
 * The options `textarea` takes. A component takes them as props on its root.
 * @stable
 */
type TextareaOptions = InputOptions & {
  /**
   * Grows and shrinks with the text. Bound it with CSS `min-height` and
   * `max-height`; past the maximum, it scrolls.
   * @defaultValue false
   */
  autoResize?: boolean
  /**
   * Runs on the submit shortcut, unless an input method is composing. Without it, the shortcut submits the form the textarea is in. With neither, the key is left alone, so Enter adds a line.
   */
  onSubmit?: (value: string, details: TextareaSubmitDetails) => void
  /**
   * Which keys submit: `"enter"`, with Shift+Enter for a new line, or `"mod+enter"`, with Enter for a new line. Without it, Enter always starts a new line.
   */
  submitShortcut?: "enter" | "mod+enter"
}

/** Native attributes the field's state attributes follow. */
type ControlProps = {
  /** Disables the field. */
  disabled?: boolean
  /** Makes the field read-only. */
  readOnly?: boolean
  /** Makes the field required. */
  required?: boolean
}

/**
 * The props the `root` slot of `input` takes.
 * @stable
 */
type InputProps = ControlProps

/**
 * The props the `root` slot of `textarea` takes.
 * @stable
 */
type TextareaProps = ControlProps

/**
 * What `render` functions and state-based class names of Input and Textarea receive.
 * @stable
 */
type InputState = {
  /** Whether the field holds any text. */
  filled: boolean
  /** Whether the field is disabled. */
  disabled: boolean
  /** Whether the field is read-only. */
  readOnly: boolean
  /** Whether the field is required. */
  required: boolean
}

/**
 * The state the `root` slot of `textarea` hands `render` functions and
 * state-based class names.
 * @stable
 */
type TextareaState = InputState

function textState(state: TextState, props: ControlProps) {
  return {
    filled: state.filled,
    disabled: !!props.disabled,
    readOnly: !!props.readOnly,
    required: !!props.required,
  }
}

function textAttrs(state: TextState, props: ControlProps) {
  return {
    "data-filled": state.filled ? "" : undefined,
    "data-disabled": props.disabled ? "" : undefined,
    "data-readonly": props.readOnly ? "" : undefined,
    "data-required": props.required ? "" : undefined,
  }
}

const inputPrimitive = /* @__PURE__ */ definePrimitive({
  name: "input",
  options: {
    value: "string",
    defaultValue: "string",
    onValueChange: "callback",
    controller: "value",
  },
  state: (options: InputOptions) => initialText(options),
  live: ["value"],
  sync: syncText,
  api: (context) => textFieldApi(context, createChange(context), "root"),
  slots: (slot) => ({
    root: slot<InputProps, InputState>({
      props: { disabled: "boolean", readOnly: "boolean", required: "boolean" },
      state: (state, { props }) => textState(state, props),
      attrs: (state, { props }) => textAttrs(state, props),
      bind: (el, { api }) => api.internal.bind(el as TextControl),
    }),
  }),
  agent: { actions: ["setValue", "clear"] },
})

/**
 * The type of `input`.
 * @stable
 */
interface InputPrimitive extends Named<typeof inputPrimitive> {}

/**
 * The input primitive, with the slots `root`.
 * Render it with an adapter's `usePrimitive`, or compose it inside your own
 * primitive.
 * @stable
 */
const input: InputPrimitive = inputPrimitive

/**
 * Sizes a textarea to its text. Browsers with `field-sizing: content` do it
 * themselves. Elsewhere it measures on every change and when its width
 * changes. CSS `min-height` and `max-height` bound it either way. Returns a cleanup.
 */
function fitContent(el: HTMLTextAreaElement) {
  if (typeof CSS !== "undefined" && CSS.supports("field-sizing", "content")) {
    el.style.setProperty("field-sizing", "content")
    return () => el.style.removeProperty("field-sizing")
  }
  let width = -1
  const fit = () => {
    el.style.height = "auto"
    const borders = el.offsetHeight - el.clientHeight
    el.style.height = `${el.scrollHeight + borders}px`
  }
  fit()
  const unwatch = watchValue(el, fit)
  const observer =
    typeof ResizeObserver === "undefined"
      ? undefined
      : new ResizeObserver(([entry]) => {
          if (entry.contentRect.width === width) {
            return
          }
          width = entry.contentRect.width
          fit()
        })
  observer?.observe(el)
  return () => {
    unwatch()
    observer?.disconnect()
    el.style.removeProperty("height")
  }
}

const textareaPrimitive = /* @__PURE__ */ definePrimitive({
  name: "textarea",
  options: {
    value: "string",
    defaultValue: "string",
    onValueChange: "callback",
    controller: "value",
    autoResize: "boolean",
    onSubmit: "callback",
    submitShortcut: "string",
  },
  // `autoResize` is state, so turning it on or off after mount reaches the bound root.
  state: (options: TextareaOptions) => ({
    ...initialText(options),
    autoResize: !!options.autoResize,
  }),
  live: ["value"],
  sync: (options) => ({
    ...syncText(options),
    autoResize: !!options.autoResize,
  }),
  api: (context) => {
    const field = textFieldApi(context, createChange(context), "root")
    const { options, store, element } = context
    function submitKey(event: KeyboardEvent) {
      const shortcut = options().submitShortcut
      if (!shortcut || event.key !== "Enter") {
        return
      }
      const mod = isApple() ? event.metaKey : event.ctrlKey
      const submits =
        shortcut === "enter"
          ? !event.shiftKey && !mod && !event.altKey
          : mod && !event.shiftKey
      if (!submits) {
        return
      }
      const { onSubmit } = options()
      const form = (element("root") as HTMLTextAreaElement | undefined)?.form
      if (!onSubmit && !form) {
        return
      }
      event.preventDefault()
      if (onSubmit) {
        onSubmit(store.get().value, { event })
      } else {
        form?.requestSubmit()
      }
    }
    return { ...field, internal: { ...field.internal, submitKey } }
  },
  slots: (slot) => ({
    root: slot<TextareaProps, TextareaState>({
      props: { disabled: "boolean", readOnly: "boolean", required: "boolean" },
      state: (state, { props }) => textState(state, props),
      attrs: (state, { props }) => textAttrs(state, props),
      on: { keydown: (event, { api }) => api.internal.submitKey(event) },
      bind: (el, { api, store }) => {
        const unbind = api.internal.bind(el as TextControl)
        let unfit: (() => void) | undefined
        const follow = () => {
          const { autoResize } = store.get()
          if (autoResize && !unfit) {
            unfit = fitContent(el as HTMLTextAreaElement)
          } else if (!autoResize && unfit) {
            unfit()
            unfit = undefined
          }
        }
        follow()
        const unfollow = select(store, "autoResize", true, follow)
        return () => {
          unbind()
          unfollow()
          unfit?.()
        }
      },
    }),
  }),
  agent: { actions: ["setValue", "clear"] },
})

/**
 * The type of `textarea`.
 * @stable
 */
interface TextareaPrimitive extends Named<typeof textareaPrimitive> {}

/**
 * The textarea primitive, with the slots `root`.
 * Render it with an adapter's `usePrimitive`, or compose it inside your own
 * primitive.
 * @stable
 */
const textarea: TextareaPrimitive = textareaPrimitive

/**
 * What `render` functions and state-based class names of InputGroup and InputClear receive.
 * @stable
 */
type InputGroupState = {
  /** Whether the field in the group holds any text. */
  filled: boolean
  /** Whether the field in the group is disabled, by itself or by a `<fieldset>`. */
  disabled: boolean
  /** Whether the field in the group is read-only. */
  readOnly: boolean
}

/**
 * The options `inputGroup` takes. A component takes them as props on its root.
 * @stable
 */
type InputGroupOptions = PrimitiveOptions

const fieldSelector = 'input:not([type="hidden"]), textarea'

function groupAttrs(state: InputGroupState) {
  return {
    "data-filled": state.filled ? "" : undefined,
    "data-disabled": state.disabled ? "" : undefined,
    "data-readonly": state.readOnly ? "" : undefined,
  }
}

const inputGroupPrimitive = /* @__PURE__ */ definePrimitive({
  // Its parts are `input-group` and `input-clear`.
  name: "input",
  state: (_options: InputGroupOptions) => ({
    filled: false,
    disabled: false,
    readOnly: false,
  }),
  api: ({ store, element }) => {
    // A clear press is input the field's change reports.
    inputSource()
    const control = () =>
      element("group")?.querySelector<TextControl>(fieldSelector) ?? undefined
    return {
      control,
      // Empties the field the way typing would, then returns focus to it.
      clear(event?: Event) {
        const el = control()
        if (!el || store.get().disabled || store.get().readOnly) {
          return
        }
        const field = textFields.get(el)
        if (field) {
          field.internal.clearPress(event)
        } else {
          writeValue(el, "", { asUser: true })
        }
        el.focus()
      },
      internal: {
        // Sets the state the group shows, like the docs' attribute tables do without a field.
        update: (state: InputGroupState) => store.set(state),
      },
    }
  },
  slots: (slot) => ({
    group: slot<{}, InputGroupState>({
      state: (state) => state,
      attrs: (state) => groupAttrs(state),
      // Presses on the group's own text and icons focus the field, like a label would.
      press: ({ api, el }, event) =>
        focusFromSurroundings(event, el, api.control()),
      bind: (el, { store, api }) => {
        let field: TextControl | undefined
        let fieldsetDisabled = false
        let cleanups: (() => void)[] = []
        let active = true
        const update = () => {
          if (!field) {
            return
          }
          store.set({
            filled: field.value !== "",
            disabled: field.disabled || fieldsetDisabled,
            readOnly: field.readOnly,
          })
        }
        // Frameworks may render the field after the group binds, or swap it.
        const find = () => {
          // The first find waits a microtask, which may run after an unbind.
          if (!active) {
            return
          }
          const next = api.control()
          if (next === field) {
            return
          }
          cleanups.forEach((cleanup) => cleanup())
          cleanups = []
          field = next
          if (!field) {
            return
          }
          const observer = new MutationObserver(update)
          observer.observe(field, { attributeFilter: ["disabled", "readonly"] })
          cleanups = [
            watchValue(field, update),
            watchFieldsets(field, (disabled) => {
              fieldsetDisabled = disabled
              update()
            }),
            () => observer.disconnect(),
          ]
          update()
        }
        queueMicrotask(find)
        const children = new MutationObserver(find)
        children.observe(el, { childList: true, subtree: true })
        return () => {
          active = false
          children.disconnect()
          cleanups.forEach((cleanup) => cleanup())
        }
      },
    }),
    // Shown while the field has text it can clear.
    clear: slot<{}, InputGroupState>({
      present: (state) => state.filled && !state.disabled && !state.readOnly,
      state: (state) => state,
      attrs: (state) => ({ type: "button", ...groupAttrs(state) }),
      press: ({ api }, event) => api.clear(event),
    }),
  }),
  // The Input inside is the component an agent reads and clears.
  agent: { shown: () => false },
})

/**
 * The type of `inputGroup`.
 * @stable
 */
interface InputGroupPrimitive extends Named<typeof inputGroupPrimitive> {}

/**
 * The input group primitive, with the slots `group`, `clear`.
 * Render it with an adapter's `usePrimitive`, or compose it inside your own
 * primitive.
 * @stable
 */
const inputGroup: InputGroupPrimitive = inputGroupPrimitive

export {
  createInputController,
  input,
  type InputController,
  inputGroup,
  type InputGroupOptions,
  type InputGroupPrimitive,
  type InputGroupState,
  type InputOptions,
  type InputPrimitive,
  type InputProps,
  type InputState,
  textarea,
  type TextareaOptions,
  type TextareaPrimitive,
  type TextareaProps,
  type TextareaState,
  type TextareaSubmitDetails,
}
export type { InputValueChangeReason } from "../../foundation/forms/text-field"
