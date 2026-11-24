import { dev, warn } from "#dev"
import { inOrder } from "../../foundation/focus/collection"
import { documentOrder } from "../../foundation/kernel/order"
import {
  bindHiddenInput,
  bindInternals,
  formInternals,
  hiddenInputStyle,
  isDisabled,
  valueMissingMessage,
} from "../../foundation/forms/form"
import type { CheckedState } from "../../foundation/forms/toggle-control"
import { createController } from "../../foundation/kernel/controller"
import type {
  ChangeDetails,
  ChangeOptions,
} from "../../foundation/kernel/details"
import { definePrimitive } from "../../foundation/kernel/primitive"
import type {
  PrimitiveContext,
  PrimitiveGeneric,
  PrimitiveOptions,
  WithGeneric,
} from "../../foundation/kernel/primitive-types"
import { createChange } from "../../foundation/kernel/input-source"
import { keepsValueOnReset } from "../../foundation/forms/value"

/**
 * The state of a checkbox that controls a group: checked when every value is
 * selected, unchecked when none is, and indeterminate in between.
 */
function groupChecked(selected: readonly string[], all: readonly string[]) {
  const count = all.filter((value) => selected.includes(value)).length
  if (count === 0) {
    return false
  }
  return count === all.length ? true : "indeterminate"
}

/**
 * Why a checkbox group's value wants to change.
 * @stable
 */
type CheckboxGroupValueChangeReason =
  "item-press" | "reset" | "restore" | "imperative"

/**
 * Options for every write method on a controller.
 * @stable
 */
type CheckboxGroupChangeOptions = ChangeOptions<CheckboxGroupValueChangeReason>

type Details = CheckboxGroupChangeOptions

/**
 * Checks and inspects a checkbox group from outside it. Pass it as the `controller` option.
 * @stable
 */
function createCheckboxGroupController<T extends string = string>() {
  return createController<{
    /** The checked values. */
    getValue: () => T[]
    /** Sets the checked values, as a user would. A disabled group ignores it. */
    setValue: (value: T[], details?: Details) => boolean
    /** Moves focus to the first enabled checkbox. */
    focus: () => void
  }>()
}

/**
 * A controller from `createCheckboxGroupController()`. Pass it as the
 * `controller` option.
 * @stable
 */
type CheckboxGroupController<T extends string = string> = ReturnType<
  typeof createCheckboxGroupController<T>
>

/**
 * The options `checkboxGroup` takes. A component takes them as props on its
 * root.
 * @stable
 */
type CheckboxGroupOptions<T extends string = string> = {
  /** The checked checkboxes' values. Pass it to control the group. */
  value?: T[]
  /**
   * The values checked at first, when uncontrolled. A form reset returns to them.
   * @defaultValue []
   */
  defaultValue?: T[]
  /** Runs when a user or a form reset wants to change the value. `details.reason` says why, and `details.cancel()` stops it. */
  onValueChange?: (
    value: T[],
    details: ChangeDetails<CheckboxGroupValueChangeReason>
  ) => void
  /**
   * Every value a parent checkbox checks. Without it, the parent checks the
   * checkboxes in the group. Pass it to render the parent right on the server.
   */
  allValues?: T[]
  /** Disables every checkbox in the group, and leaves them out of the form. */
  disabled?: boolean
  /** Makes every checkbox in the group read-only: focusable and submitted, but presses don't change it. */
  readOnly?: boolean
  /** Blocks form submission until at least one checkbox is checked, with the browser's own message. */
  required?: boolean
  /** The name every checkbox in the group submits under. */
  name?: string
  /** The id of a form to belong to, when the group isn't inside that form. */
  form?: string
  /** Checks values from anywhere. Create one with `createCheckboxGroupController()`. */
  controller?: CheckboxGroupController<T>
} & PrimitiveOptions

/**
 * What `render` functions and state-based class names receive.
 * @stable
 */
type CheckboxGroupState = {
  /** The checked values. */
  value: string[]
  /** Whether the group is disabled, by itself or by a `<fieldset>`. */
  disabled: boolean
  /** Whether the group is read-only: its checkboxes stay focusable and submitted, but presses don't change them. */
  readOnly: boolean
  /** Whether a form won't submit until at least one of its checkboxes is checked. */
  required: boolean
}

type GroupState = {
  value: string[]
  // What a form reset returns to: `defaultValue`, or the first value.
  initial: string[]
  allValues: string[] | undefined
  disabled: boolean
  readOnly: boolean
  required: boolean
  name: string | undefined
  form: string | undefined
  formDisabled: boolean
  // Values of the checkboxes in the group, in document order.
  children: string[]
  // The ones that aren't disabled.
  enabled: string[]
  // Their ids, for a parent's aria-controls.
  ids: string
}

const same = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((value, index) => value === b[index])

// What the form gets, like native checkboxes: the checked ones on the page that aren't disabled.
const submitted = (state: GroupState) =>
  state.enabled.filter((value) => state.value.includes(value))

function checkboxGroupApiBody(
  context: PrimitiveContext<CheckboxGroupOptions, GroupState, string>
) {
  const { id, store, element } = context
  const change = createChange(context)
  // Each checkbox in the group: its root element, and whether it's disabled.
  const children = new Map<
    string,
    { el: HTMLElement; disabled: () => boolean }
  >()

  const disabled = () => isDisabled(store.get())
  const all = () => store.get().allValues ?? store.get().children

  // In document order, not the order they joined, since one can mount before the others later.
  function firstEnabled() {
    for (const value of store.get().children) {
      const child = children.get(value)
      if (child?.el.isConnected && !child.disabled()) {
        return child.el
      }
    }
  }

  function setValue(
    value: string[],
    details: { reason: CheckboxGroupValueChangeReason; event?: Event }
  ) {
    if (same(value, store.get().value)) {
      return true
    }
    // Keep the document order, so forms submit values the same way every time.
    return change("value", inOrder(value, all()), details)
  }

  function refreshChildren() {
    // The connected checkboxes, in document order.
    const ordered = [...children.entries()]
      .filter(([, child]) => child.el.isConnected)
      .sort(([, a], [, b]) => documentOrder(a.el, b.el))
      .map(([value]) => value)
    const enabled = ordered.filter((value) => !children.get(value)!.disabled())
    const ids = ordered.map((value) => children.get(value)!.el.id).join(" ")
    const state = store.get()
    store.set({
      ...(same(ordered, state.children) ? {} : { children: ordered }),
      ...(same(enabled, state.enabled) ? {} : { enabled }),
      ids,
    })
  }

  const api = {
    id,
    getValue: () => store.get().value,
    setValue: (
      value: string[],
      { reason = "imperative", event }: Details = {}
    ) => !disabled() && setValue(value, { reason, event }),
    focus: () => firstEnabled()?.focus(),
    name: () => store.get().name,
    form: () => store.get().form,
    disabled,
    readOnly: () => store.get().readOnly,
    checked: (value: string) => store.get().value.includes(value),
    // A parent checkbox: checked when all are, indeterminate when some are.
    parentChecked: () => groupChecked(store.get().value, all()),
    setChild(
      value: string,
      checked: boolean,
      details: { reason: CheckboxGroupValueChangeReason; event?: Event }
    ) {
      if (disabled()) {
        return false
      }
      const current = store.get().value
      return setValue(
        checked
          ? [...current.filter((item) => item !== value), value]
          : current.filter((item) => item !== value),
        details
      )
    },
    // Whether every enabled checkbox is checked, so a parent's press can only uncheck.
    allEnabledChecked() {
      const current = store.get().value
      return all().every(
        (value) => children.get(value)?.disabled() || current.includes(value)
      )
    },
    // The form the group belongs to, for its checkboxes.
    formOwner: () =>
      formInternals(element("group"))?.form ??
      (element("group-input") as HTMLInputElement | undefined)?.form ??
      null,
    // Checks or unchecks every enabled checkbox. Disabled ones keep their state.
    setAll(
      checked: boolean,
      details: { reason: CheckboxGroupValueChangeReason; event?: Event }
    ) {
      if (disabled()) {
        return false
      }
      const locked = (value: string) => children.get(value)?.disabled() ?? false
      const current = store.get().value
      const next = checked
        ? [...new Set([...current, ...all().filter((value) => !locked(value))])]
        : current.filter((value) => locked(value))
      return setValue(next, details)
    },
    // The ids of the checkboxes in the group, for a parent's aria-controls.
    childIds: () => store.get().ids,
    // Checkboxes in the group register as they bind.
    register(value: string, el: HTMLElement, isDisabled: () => boolean) {
      if (!el.id) {
        el.id = `${id}-${value.replace(/[\s%]/g, encodeURIComponent)}`
      }
      // Checkboxes register by value, so two with the same one, like two
      // without a `value` ("on"), replace each other.
      if (dev) {
        const other = children.get(value)?.el
        if (other && other !== el && other.isConnected) {
          warn(
            `two checkboxes in a group share the value "${value}". Give each its own \`value\`.`,
            {
              component: "checkbox-group",
              id,
            }
          )
        }
      }
      children.set(value, { el, disabled: isDisabled })
      queueMicrotask(refreshChildren)
      return () => {
        if (children.get(value)?.el === el) {
          children.delete(value)
        }
        queueMicrotask(refreshChildren)
      }
    },
    subscribe: store.subscribe,
    internal: {
      reset() {
        const { value, defaultValue } = context.options()
        if (keepsValueOnReset(value, defaultValue)) {
          return
        }
        change("value", store.get().initial, { reason: "reset" })
      },
      // The browser restores a disabled group too, as a native one.
      restore(saved: string) {
        setValue(saved ? saved.split("\n") : [], { reason: "restore" })
      },
      setFormDisabled(formDisabled: boolean) {
        store.set({ formDisabled })
      },
      // A checkbox in the group was disabled or enabled.
      refreshChildren: () => queueMicrotask(refreshChildren),
      anchor: firstEnabled,
    },
  }

  return api
}

const checkboxGroupApi: (
  ...args: Parameters<typeof checkboxGroupApiBody>
) => CheckboxGroupApi = checkboxGroupApiBody

/**
 * `checkboxGroup`'s api, which its slots and controller call.
 * Adapters expose it as `api`.
 * @stable
 */
interface CheckboxGroupApi extends ReturnType<typeof checkboxGroupApiBody> {}

// The checkbox group's types as functions of its value type `T`, so every
// renderer's `CheckboxGroup` infers `T` from `value`, `defaultValue`,
// `allValues` or `onValueChange`.
interface CheckboxGroupGeneric extends PrimitiveGeneric {
  T: string
  options: CheckboxGroupOptions<this["T"] & string>
}

const checkboxGroupPrimitive = /* @__PURE__ */ definePrimitive({
  name: "checkbox",
  label: "checkbox-group",
  options: {
    value: "list",
    defaultValue: "list",
    onValueChange: "callback",
    allValues: "list",
    disabled: "boolean",
    readOnly: "boolean",
    required: "boolean",
    name: "string",
    form: "string",
    controller: "value",
  },
  state: (options: CheckboxGroupOptions): GroupState => {
    const value = options.value ?? options.defaultValue ?? []
    return {
      value,
      initial: value,
      allValues: options.allValues,
      disabled: !!options.disabled,
      readOnly: !!options.readOnly,
      required: !!options.required,
      name: options.name,
      form: options.form,
      formDisabled: false,
      children: [],
      enabled: [],
      ids: "",
    }
  },
  sync: (options) => ({
    allValues: options.allValues,
    disabled: !!options.disabled,
    readOnly: !!options.readOnly,
    required: !!options.required,
    name: options.name,
    form: options.form,
    // Like the native `defaultChecked`, changing it changes what a reset returns to.
    ...(options.defaultValue === undefined
      ? {}
      : { initial: options.defaultValue }),
    ...(options.value === undefined ? {} : { value: options.value }),
  }),
  live: ["ids"],
  api: checkboxGroupApi,
  slots: (slot) => ({
    group: slot<{}, CheckboxGroupState>({
      role: "group",
      state: (state) => ({
        value: state.value,
        disabled: isDisabled(state),
        readOnly: state.readOnly,
        required: state.required,
      }),
      attrs: (state) => ({
        "aria-disabled": isDisabled(state) ? "true" : undefined,
        "data-disabled": isDisabled(state) ? "" : undefined,
        "data-readonly": state.readOnly ? "" : undefined,
        "data-required": state.required ? "" : undefined,
      }),
      bind: (el, { api, store }) =>
        bindInternals(el, {
          value: () => submitted(store.get()),
          name: () => store.get().name,
          state: () => store.get().value.join("\n"),
          restore: api.internal.restore,
          valueMissing: () =>
            store.get().required && submitted(store.get()).length === 0,
          message: () => valueMissingMessage("checkbox"),
          anchor: api.internal.anchor,
          focus: api.focus,
          reset: api.internal.reset,
          disabled: api.internal.setFormDisabled,
          subscribe: store.subscribe,
        }),
    }),

    // React and Vue: an unnamed native checkbox that carries the group's
    // `required`, so the browser blocks submission until one is checked.
    // The checkboxes themselves submit the values. Its own name keeps its
    // `data-slot` apart from the checkboxes' inputs.
    "group-input": slot({
      attrs: (state) => ({
        type: "checkbox",
        form: state.form,
        checked: state.initial.length ? "" : undefined,
        required: state.required ? "" : undefined,
        disabled: state.disabled ? "" : undefined,
        "aria-hidden": "true",
        tabindex: "-1",
        style: hiddenInputStyle,
      }),
      bind: (el, { api, store }) =>
        bindHiddenInput(el as HTMLInputElement, {
          checked: () => submitted(store.get()).length > 0,
          subscribe: store.subscribe,
          focus: api.focus,
          reset: api.internal.reset,
          disabled: api.internal.setFormDisabled,
        }),
    }),
  }),
  agent: { actions: ["setValue", "setAll"] },
})
/**
 * The type of `checkboxGroup`.
 * @stable
 */
interface CheckboxGroupPrimitive extends WithGeneric<
  typeof checkboxGroupPrimitive,
  CheckboxGroupGeneric
> {}

/**
 * The checkbox group primitive, with the slots `group`, `group-input`.
 * Render it with an adapter's `usePrimitive`, or compose it inside your own
 * primitive.
 * @stable
 */
const checkboxGroup = checkboxGroupPrimitive as CheckboxGroupPrimitive

export {
  checkboxGroup,
  type CheckboxGroupApi,
  type CheckboxGroupChangeOptions,
  type CheckboxGroupController,
  type CheckboxGroupGeneric,
  type CheckboxGroupOptions,
  type CheckboxGroupPrimitive,
  type CheckboxGroupState,
  type CheckboxGroupValueChangeReason,
  type CheckedState,
  createCheckboxGroupController,
  groupChecked,
}
