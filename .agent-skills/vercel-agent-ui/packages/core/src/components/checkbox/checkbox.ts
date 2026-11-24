import { animateIn, animateOut } from "../../foundation/motion/presence"
import type { CheckboxGroupApi, CheckedState } from "./checkbox-group"
import { createController } from "../../foundation/kernel/controller"
import { deriveFromOptions } from "../../foundation/kernel/derive"
import { definePrimitive } from "../../foundation/kernel/primitive"
import type {
  Named,
  PrimitiveContext,
  PrimitiveOptions,
} from "../../foundation/kernel/primitive-types"
import {
  checkedAttribute,
  isDisabled,
  switchState,
  syncToggle,
  toggleControl,
  toggleDataAttrs,
  toggleSlots,
  toggleState,
  type CheckboxChangeOptions,
  type CheckboxState,
  type ToggleOptions,
  type ToggleState,
} from "../../foundation/forms/toggle-control"
import { live } from "../../foundation/kernel/live"
import { createChange } from "../../foundation/kernel/input-source"

type Details = CheckboxChangeOptions

/**
 * Toggles and inspects a checkbox from outside it. Pass it as the `controller` option.
 * @stable
 */
function createCheckboxController() {
  return createController<{
    /** Checks it, or unchecks it. An indeterminate checkbox becomes checked. */
    toggle: (details?: Details) => boolean
    /** Whether it's checked: `true`, `false` or `"indeterminate"`. */
    getChecked: () => CheckedState
    /** Sets whether it's checked, as a user would. */
    setChecked: (checked: CheckedState, details?: Details) => boolean
    /** Moves focus to it. */
    focus: () => void
  }>()
}

/**
 * A controller from `createCheckboxController()`. Pass it as the `controller`
 * option.
 * @stable
 */
type CheckboxController = ReturnType<typeof createCheckboxController>

/**
 * The options `checkbox` takes. A component takes them as props on its root.
 * @stable
 */
type CheckboxOptions = ToggleOptions<CheckedState> & {
  /** Toggles it from anywhere. Create one with `createCheckboxController()`. */
  controller?: CheckboxController
  /**
   * Makes it the parent of its group: it checks or unchecks every checkbox in
   * the group, and shows checked, unchecked or indeterminate from them.
   * @defaultValue false
   */
  parent?: boolean
} & PrimitiveOptions

/** What adapters pass on top: the group a checkbox belongs to, found from context. */
type CheckboxInternalOptions = CheckboxOptions & {
  group?: () => CheckboxGroupApi | undefined
}

/**
 * The props the `indicator` slot of `checkbox` takes.
 * @stable
 */
type CheckboxIndicatorProps = {
  /**
   * Whether the indicator stays in the page while unchecked, so it can be styled
   * or animated in both states.
   * @defaultValue false
   */
  keepMounted?: boolean
}

/**
 * The state the `indicator` slot of `checkbox` hands `render` functions and
 * state-based class names.
 * @stable
 */
type CheckboxIndicatorState = CheckboxState

type CheckboxToggleState = ToggleState & {
  // The indicator is animating out.
  exiting: boolean
  // A parent's checkboxes, by id.
  controls: string | undefined
}

// Inside a group, the group decides whether it's checked, its name and whether it's disabled.
function fromGroup(options: CheckboxInternalOptions) {
  const group = options.group?.()
  if (!group) {
    return undefined
  }
  const parent = !!options.parent
  return {
    checked: (parent
      ? group.parentChecked()
      : group.checked(options.value ?? "on")) as CheckedState,
    // A parent stands for the others, so it submits nothing.
    name: parent ? undefined : (options.name ?? group.name()),
    disabled: !!options.disabled || group.disabled(),
    readOnly: !!options.readOnly || group.readOnly(),
    form: options.form ?? group.form(),
  }
}

function checkboxSync(options: CheckboxInternalOptions) {
  const group = fromGroup(options)
  if (!group) {
    return syncToggle(options)
  }
  return {
    ...group,
    required: !!options.required,
    value: options.value ?? "on",
  }
}

function checkboxApiBody(
  context: PrimitiveContext<
    CheckboxInternalOptions,
    CheckboxToggleState,
    string
  >
) {
  const { store, element, options } = context
  const change = createChange(context)
  const group = () => options().group?.()
  const isParent = () => !!options().parent
  const control = toggleControl<CheckedState, CheckboxGroupApi>(
    context,
    change,
    {
      owner: group,
      write(owner, checked, details) {
        // The group decides. Its value then decides this checkbox.
        const { reason, event } = details
        const forGroup = {
          reason: reason === "press" ? ("item-press" as const) : reason,
          event,
        }
        // A mixed parent checks the rest. When only disabled ones are left
        // unchecked, there's nothing to check, so it unchecks instead.
        const accepted = isParent()
          ? owner.setAll(
              checked === true && !owner.allEnabledChecked(),
              forGroup
            )
          : owner.setChild(store.get().value, checked === true, forGroup)
        if (!accepted) {
          return false
        }
        change(
          "checked",
          isParent() ? owner.parentChecked() : owner.checked(store.get().value),
          details
        )
        return true
      },
    }
  )
  // Changes after mount animate the indicator. The first paint never does.
  let changed = false

  // Unchecking keeps the indicator while it animates out, in the same write,
  // so it never disappears for a frame first.
  const exitingAfter = (was: CheckedState, checked: CheckedState) =>
    checked === false && was !== false && !!element("indicator")
  // A controlled `checked` starts the indicator's exit in the same pass.
  deriveFromOptions(context, ["exiting"], (synced, state) =>
    "checked" in synced && synced.checked !== state.checked
      ? { exiting: exitingAfter(state.checked, synced.checked as CheckedState) }
      : undefined
  )
  let previous = store.get().checked
  store.subscribe(() => {
    const { checked } = store.get()
    if (checked === previous) {
      return
    }
    const was = previous
    previous = checked
    changed = true
    store.set({ exiting: exitingAfter(was, checked) })
  })

  return {
    ...control,
    isChanged: () => changed,
    internal: {
      ...control.internal,
      // Joins the group, and follows its value from then on.
      joinGroup(el: HTMLElement) {
        const owner = group()
        if (!owner) {
          return () => {}
        }
        const follow = () => {
          const { name, disabled, readOnly, form } = fromGroup(options())!
          store.set({
            checked: isParent()
              ? owner.parentChecked()
              : owner.checked(store.get().value),
            controls: isParent() ? owner.childIds() || undefined : undefined,
            name,
            disabled,
            readOnly,
            form,
          })
        }
        const unsubscribe = owner.subscribe(follow)
        follow()
        if (isParent()) {
          return unsubscribe
        }
        const join = () =>
          owner.register(store.get().value, el, () => isDisabled(store.get()))
        let leave = join()
        let { value } = store.get()
        let disabled = isDisabled(store.get())
        const unsubscribeSelf = store.subscribe(() => {
          const state = store.get()
          if (state.value !== value) {
            value = state.value
            leave()
            leave = join()
          } else if (isDisabled(state) !== disabled) {
            owner.internal.refreshChildren()
          }
          disabled = isDisabled(state)
        })
        return () => {
          unsubscribe()
          unsubscribeSelf()
          leave()
        }
      },
      finishExit() {
        store.set({ exiting: false })
      },
    },
  }
}

const checkboxApi: (
  ...args: Parameters<typeof checkboxApiBody>
) => CheckboxApi = checkboxApiBody

/**
 * `checkbox`'s api, which its slots and controller call.
 * Adapters expose it as `api`.
 * @stable
 */
interface CheckboxApi extends ReturnType<typeof checkboxApiBody> {}

const checkboxState = (state: ToggleState) => ({
  ...switchState(state),
  indeterminate: state.checked === "indeterminate",
})

const checkboxPrimitive = /* @__PURE__ */ definePrimitive({
  name: "checkbox",
  options: {
    checked: checkedAttribute,
    defaultChecked: checkedAttribute,
    onCheckedChange: "callback",
    disabled: "boolean",
    readOnly: "boolean",
    required: "boolean",
    name: "string",
    value: "string",
    form: "string",
    controller: "value",
    parent: "boolean",
    // Internal: passed by renderers.
    group: "value",
  },
  state: (options: CheckboxInternalOptions): CheckboxToggleState => {
    const group = fromGroup(options)
    return {
      ...toggleState(group ? { ...options, ...group } : options),
      exiting: false,
      controls: undefined,
    }
  },
  controlled: ["checked"],
  live: ["controls"],
  sync: checkboxSync,
  api: checkboxApi,
  slots: (slot) => {
    const { root, input } = toggleSlots("checkbox", slot, checkboxState)
    return {
      root: slot<{}, CheckboxState>({
        ...root,
        // A parent checkbox points at the checkboxes it controls.
        live: live((state) => ({ "aria-controls": state.controls })),
        bind: (el, part) => {
          const leave = part.api.internal.joinGroup(el)
          const unbind = root.bind?.(el, part)
          return () => {
            unbind?.()
            leave()
          }
        },
      }),
      input,
      indicator: slot<CheckboxIndicatorProps, CheckboxState>({
        props: { keepMounted: "boolean" },
        present: (state, { props }) =>
          !!props.keepMounted || state.checked !== false || state.exiting,
        state: checkboxState,
        attrs: (state) => toggleDataAttrs(state),
        bind(el, { api, store, props }) {
          let stop: (() => void) | undefined
          let shown = store.get().checked !== false
          if (shown && api.isChanged()) {
            stop = animateIn(el)
          }
          const unsubscribe = store.subscribe(() => {
            const { checked, exiting } = store.get()
            // Ahead of the render, for exit keyframes keyed on the state.
            el.toggleAttribute("data-checked", checked === true)
            el.toggleAttribute("data-unchecked", checked === false)
            el.toggleAttribute(
              "data-indeterminate",
              checked === "indeterminate"
            )
            if ((checked !== false) === shown) {
              return
            }
            shown = checked !== false
            stop?.()
            stop = undefined
            if (shown) {
              stop = animateIn(el)
            } else if (exiting || props.keepMounted) {
              stop = animateOut(el, () => {
                stop = undefined
                api.internal.finishExit()
              })
            }
          })
          return () => {
            unsubscribe()
            stop?.()
          }
        },
      }),
    }
  },
  agent: { actions: ["setChecked"] },
})

/**
 * The type of `checkbox`.
 * @stable
 */
interface CheckboxPrimitive extends Named<typeof checkboxPrimitive> {}

/**
 * The checkbox primitive, with the slots `root`, `input`, `indicator`.
 * Render it with an adapter's `usePrimitive`, or compose it inside your own
 * primitive.
 * @stable
 */
const checkbox: CheckboxPrimitive = checkboxPrimitive

export {
  checkbox,
  type CheckboxApi,
  type CheckboxController,
  type CheckboxIndicatorProps,
  type CheckboxIndicatorState,
  type CheckboxOptions,
  type CheckboxPrimitive,
  createCheckboxController,
}
export {
  checkboxGroup,
  type CheckboxGroupApi,
  type CheckboxGroupChangeOptions,
  type CheckboxGroupController,
  type CheckboxGroupOptions,
  type CheckboxGroupPrimitive,
  type CheckboxGroupState,
  type CheckboxGroupValueChangeReason,
  type CheckedState,
  createCheckboxGroupController,
} from "./checkbox-group"
export type {
  CheckboxCheckedChangeReason,
  CheckboxChangeOptions,
  CheckboxState,
} from "../../foundation/forms/toggle-control"
