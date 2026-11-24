import {
  bindHiddenInput,
  bindInternals,
  dispatchChange,
  formInternals,
  hiddenInputStyle,
  isDisabled,
  submitImplicitly,
  valueMissingMessage,
} from "./form"
import { checkedAttrs } from "../kernel/attrs"
import type { ChangeDetails, ChangeOptions } from "../kernel/details"
import type { PrimitiveContext, SlotFactory } from "../kernel/primitive-types"
import { keepsValueOnReset } from "./value"

/**
 * Checked, unchecked, or `"indeterminate"`, for a checkbox that stands for a partly checked group.
 * @stable
 */
type CheckedState = boolean | "indeterminate"

/**
 * Why a checkbox or switch wants to change.
 * @stable
 */
type CheckboxCheckedChangeReason = "press" | "reset" | "restore" | "imperative"

/**
 * Options for every write method on a controller.
 * @stable
 */
type CheckboxChangeOptions = ChangeOptions<CheckboxCheckedChangeReason>

type Details = CheckboxChangeOptions

type ToggleOptions<Checked> = {
  /** Whether it's checked. Pass it to control the checkbox. */
  checked?: Checked
  /**
   * Whether it's checked at first, when uncontrolled. A form reset returns to it.
   * @defaultValue false
   */
  defaultChecked?: Checked
  /** Runs when a user or a form reset wants to change it. `details.reason` says why, and `details.cancel()` stops it. */
  onCheckedChange?: (
    checked: Checked,
    details: ChangeDetails<CheckboxCheckedChangeReason>
  ) => void
  /** Disables it like a native control: it can't be focused or changed, and isn't submitted. */
  disabled?: boolean
  /** Keeps it focusable and submitted, but stops changes. */
  readOnly?: boolean
  /** Blocks form submission until it's checked, with the browser's own message. */
  required?: boolean
  /** The name it submits under. Without one, it submits nothing. */
  name?: string
  /**
   * What it submits while checked.
   * @defaultValue "on"
   */
  value?: string
  /** The id of a form to belong to, when it isn't inside that form. */
  form?: string
}

// Reads a checkbox's `checked` and `default-checked` attributes: checked,
// unchecked or "indeterminate".
function checkedAttribute(attribute: string | null) {
  if (attribute === null) {
    return undefined
  }
  return attribute === "indeterminate" ? "indeterminate" : attribute !== "false"
}

/**
 * What `render` functions and state-based class names receive.
 * @stable
 */
type CheckboxState = {
  /** Whether it's checked. False while indeterminate. */
  checked: boolean
  /** Whether it's `"indeterminate"`, for a partly checked group. A press makes it checked. */
  indeterminate: boolean
  /** Whether it's disabled, by itself or by a `<fieldset>`. */
  disabled: boolean
  /** Whether it's read-only: it stays focusable and submitted, but presses don't change it. */
  readOnly: boolean
  /** Whether a form won't submit until it's checked. Indeterminate doesn't count. */
  required: boolean
}

type ToggleState = {
  checked: CheckedState
  // What a form reset returns to: `defaultChecked`, or the first value.
  initial: CheckedState
  disabled: boolean
  readOnly: boolean
  required: boolean
  name: string | undefined
  value: string
  form: string | undefined
  // Disabled by an ancestor fieldset, or by the element's own disabled attribute.
  formDisabled: boolean
}

type AnyOptions = ToggleOptions<CheckedState> | ToggleOptions<boolean>

function toggleState(options: AnyOptions): ToggleState {
  const checked = options.checked ?? options.defaultChecked ?? false
  return {
    checked,
    initial: checked,
    disabled: !!options.disabled,
    readOnly: !!options.readOnly,
    required: !!options.required,
    name: options.name,
    value: options.value ?? "on",
    form: options.form,
    formDisabled: false,
  }
}

function syncToggle(options: AnyOptions) {
  return {
    disabled: !!options.disabled,
    readOnly: !!options.readOnly,
    required: !!options.required,
    name: options.name,
    value: options.value ?? "on",
    form: options.form,
    // Like the native `defaultChecked`, changing it changes what a reset returns to.
    ...(options.defaultChecked === undefined
      ? {}
      : { initial: options.defaultChecked }),
    ...(options.checked === undefined ? {} : { checked: options.checked }),
  }
}

// What a toggle needs from its group: the form the group belongs to.
type ToggleOwner = { formOwner: () => HTMLFormElement | null }

// The group a checkbox belongs to. It takes the checkbox's changes and resets, and lends it its form.
type ToggleGroup<Owner extends ToggleOwner> = {
  owner: () => Owner | undefined
  write: (
    owner: Owner,
    checked: CheckedState,
    details: { reason: CheckboxCheckedChangeReason; event?: Event }
  ) => boolean
}

// `Checked` is what the control can be: a checkbox's `CheckedState`, or a switch's boolean.
function toggleControl<
  Checked extends CheckedState,
  Owner extends ToggleOwner = ToggleOwner,
>(
  {
    store,
    element,
    options,
  }: Pick<
    PrimitiveContext<AnyOptions, ToggleState, string>,
    "store" | "element" | "options"
  >,
  change: (
    key: "checked",
    value: CheckedState,
    details: { reason: CheckboxCheckedChangeReason; event?: Event }
  ) => boolean,
  group?: ToggleGroup<Owner>
) {
  // The element that takes part in the form: the hidden input, or the custom element itself.
  const formElement = () => {
    const root = element("root")
    return formInternals(root) ? root : element("input")
  }
  const formOwner = () => {
    const root = element("root")
    return (
      formInternals(root)?.form ??
      (element("input") as HTMLInputElement | undefined)?.form ??
      group?.owner()?.formOwner()
    )
  }

  function write(
    checked: CheckedState,
    details: { reason: CheckboxCheckedChangeReason; event?: Event }
  ) {
    const owner = group?.owner()
    return group && owner
      ? group.write(owner, checked, details)
      : change("checked", checked, details)
  }

  // Sets any state. Parts and forms use it; a switch's controller takes only booleans.
  function setState(
    checked: CheckedState,
    { reason = "imperative", event }: Details = {}
  ) {
    const state = store.get()
    if (isDisabled(state) || state.readOnly) {
      return false
    }
    const done = write(checked, { reason, event })
    if (done && reason !== "restore") {
      dispatchChange(formElement())
    }
    return done
  }

  return {
    // A switch's options take only booleans, so its state never holds anything else.
    getChecked: () => store.get().checked as Checked,
    // Sets the state, as a user would. Disabled and read-only controls ignore it.
    setChecked: (checked: Checked, details?: Details) =>
      setState(checked, details),
    // An indeterminate checkbox becomes checked.
    toggle(details: Details = {}) {
      return setState(store.get().checked !== true, details)
    },
    focus: () => element("root")?.focus(),
    form: formOwner,
    internal: {
      // The state a form restores after a reload, as `String(checked)` saved
      // it. The browser restores a disabled or read-only control too, as a native one.
      restore(saved: string) {
        write(saved === "indeterminate" ? "indeterminate" : saved === "true", {
          reason: "restore",
        })
      },
      reset() {
        // A group resets its checkboxes itself.
        if (
          group?.owner() ||
          keepsValueOnReset(options().checked, options().defaultChecked)
        ) {
          return
        }
        change("checked", store.get().initial, { reason: "reset" })
      },
      setFormDisabled(formDisabled: boolean) {
        store.set({ formDisabled })
      },
      root: () => element("root"),
    },
  }
}

// The api the shared slots use.
type ToggleApi = Omit<
  ReturnType<typeof toggleControl>,
  "getChecked" | "setChecked"
>

const isNativeButton = (el: HTMLElement | undefined) =>
  el instanceof HTMLButtonElement

const switchState = (state: ToggleState) => ({
  checked: state.checked === true,
  disabled: isDisabled(state),
  readOnly: state.readOnly,
  required: state.required,
})

const toggleDataAttrs = (state: ToggleState) => ({
  ...checkedAttrs(state.checked),
  "data-disabled": isDisabled(state) ? "" : undefined,
  "data-readonly": state.readOnly ? "" : undefined,
  "data-required": state.required ? "" : undefined,
})

// The slots Checkbox and Switch share. `role` is checkbox or switch.
function toggleSlots<
  State extends ToggleState,
  Api extends ToggleApi,
  Public extends object,
>(
  role: "checkbox" | "switch",
  slot: SlotFactory<State, Api>,
  publicState: (state: State) => Public
) {
  return {
    // The control itself: a button in React and Vue, the custom element on the web.
    root: slot<{}, Public>({
      // One literal at a time, since TypeScript can't check what a union of roles needs.
      ...(role === "checkbox"
        ? { role: "checkbox" as const }
        : { role: "switch" as const }),
      focus: "tab-stop",
      state: publicState,
      attrs: (state) => ({
        type: "button",
        "aria-checked":
          state.checked === "indeterminate" ? "mixed" : String(state.checked),
        "aria-readonly": state.readOnly ? "true" : undefined,
        "aria-required": state.required ? "true" : undefined,
        // Custom elements and fieldsets disable without the native attribute.
        "aria-disabled": isDisabled(state) ? "true" : undefined,
        disabled: state.disabled ? "" : undefined,
        tabindex: isDisabled(state) ? undefined : "0",
        ...toggleDataAttrs(state),
      }),
      press: ({ api }, event) => {
        // A click on something inside the control, like its indicator, would
        // make a <label> around it click the control again in Firefox and Safari.
        event?.preventDefault()
        api.toggle({ reason: "press", event })
      },
      on: {
        keydown: (event, { api, el }) => {
          if (event.key === "Enter") {
            // Enter submits the form, like on a native checkbox, and never toggles.
            event.preventDefault()
            if (!event.repeat) {
              submitImplicitly(api.form())
            }
          } else if (event.key === " " && !isNativeButton(el)) {
            // Toggles on release, like a button. Stops the page from scrolling.
            event.preventDefault()
          }
        },
        keyup: (event, { api, el }) => {
          if (event.key === " " && !isNativeButton(el)) {
            api.toggle({ reason: "press", event })
          }
        },
      },
      bind: (el, { api, store }) =>
        bindInternals(el, {
          value: () =>
            store.get().checked === true && store.get().name !== undefined
              ? store.get().value
              : null,
          state: () => String(store.get().checked),
          restore: api.internal.restore,
          valueMissing: () =>
            store.get().required && store.get().checked !== true,
          message: () => valueMissingMessage("checkbox"),
          reset: api.internal.reset,
          disabled: api.internal.setFormDisabled,
          subscribe: store.subscribe,
        }),
    }),

    // React and Vue: the native input that takes part in the form.
    input: slot({
      attrs: (state) => ({
        type: "checkbox",
        name: state.name,
        value: state.value,
        form: state.form,
        // The default checkedness, which the server renders and a form reset returns to.
        checked: state.initial === true ? "" : undefined,
        required: state.required ? "" : undefined,
        disabled: state.disabled ? "" : undefined,
        "aria-hidden": "true",
        tabindex: "-1",
        style: hiddenInputStyle,
      }),
      bind: (el, { api, store }) =>
        bindHiddenInput(el as HTMLInputElement, {
          checked: () => store.get().checked === true,
          indeterminate: () => store.get().checked === "indeterminate",
          subscribe: store.subscribe,
          focus: api.focus,
          control: api.internal.root,
          activate: (event) => api.toggle({ reason: "press", event }),
          reset: api.internal.reset,
          disabled: api.internal.setFormDisabled,
        }),
    }),
  }
}

export {
  type CheckboxChangeOptions,
  checkedAttribute,
  type CheckboxCheckedChangeReason,
  type CheckboxState,
  type CheckedState,
  isDisabled,
  switchState,
  syncToggle,
  toggleControl,
  toggleDataAttrs,
  type ToggleGroup,
  type ToggleOptions,
  toggleSlots,
  toggleState,
  type ToggleState,
}
