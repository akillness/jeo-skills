import { inOrder, orientationOf } from "../../foundation/focus/collection"
import { createOrder } from "../../foundation/kernel/order"
import {
  followStop,
  memberDisabled,
  memberFocusable,
  queued,
  type RovingMember,
  type RovingScope,
} from "../../foundation/focus/roving-scope"
import { createRovingFocus } from "../../foundation/focus/roving-focus"
import { watchFormDisabled } from "../../foundation/forms/form"
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

/**
 * Why the pressed toggles changed: a toggle was pressed, or a controller or `api` call changed them.
 * @stable
 */
type ToggleGroupValueChangeReason = "item-press" | "imperative"

/**
 * Options for every write method on a controller.
 * @stable
 */
type ToggleGroupChangeOptions = ChangeOptions<ToggleGroupValueChangeReason>

/**
 * Presses and inspects toggles from outside the group: a keyboard shortcut, a
 * "Reset formatting" button or a test. Pass it as the `controller` option.
 * @stable
 */
function createToggleGroupController<T extends string = string>() {
  return createController<{
    /** The pressed toggles' values, in the order they appear. */
    getValue: () => T[]
    /** Sets the pressed toggles. Only the first counts unless `multiple` is set. Returns false when canceled. */
    setValue: (value: T[], options?: ToggleGroupChangeOptions) => boolean
    /** Whether a toggle is pressed. */
    isPressed: (value: T) => boolean
    /** Presses a toggle, or unpresses a pressed one, as a user would. Disabled toggles and `deselectable={false}` refuse it. */
    toggle: (value: T, options?: ToggleGroupChangeOptions) => boolean
    /** Moves focus to a toggle, or to the one that holds the group's tab stop. */
    focus: (value?: T) => void
  }>()
}

/**
 * A controller from `createToggleGroupController()`. Pass it as the
 * `controller` option.
 * @stable
 */
type ToggleGroupController<T extends string = string> = ReturnType<
  typeof createToggleGroupController<T>
>

/**
 * Which way the toggles run, which picks the arrow keys that move between
 * them.
 * @stable
 */
type ToggleGroupOrientation = "horizontal" | "vertical"

/**
 * The options `toggleGroup` takes. A component takes them as props on its
 * root.
 * @stable
 */
type ToggleGroupOptions<T extends string = string> = {
  /** The pressed toggles' values. Pass it to control the group. */
  value?: T[]
  /**
   * The toggles pressed at first, when uncontrolled.
   * @defaultValue []
   */
  defaultValue?: T[]
  /** Runs when a toggle wants to be pressed or unpressed. `details.reason` says why, and `details.cancel()` stops it. */
  onValueChange?: (
    value: T[],
    details: ChangeDetails<ToggleGroupValueChangeReason>
  ) => void
  /**
   * Whether several toggles can be pressed at once. Otherwise pressing one unpresses the others.
   * @defaultValue false
   */
  multiple?: boolean
  /**
   * Whether the pressed toggle can be unpressed when only one may be pressed.
   * With `false`, one toggle stays pressed once any is. Ignored with `multiple`.
   * @defaultValue true
   */
  deselectable?: boolean
  /**
   * Stops every toggle from being pressed. They stay focusable with
   * `aria-disabled`, so the group keeps its tab stop and stays discoverable.
   * @defaultValue false
   */
  disabled?: boolean
  /**
   * Which arrow keys move between toggles: left and right, or up and down.
   * @defaultValue "horizontal"
   */
  orientation?: ToggleGroupOrientation
  /**
   * Whether arrow keys wrap from the last toggle to the first.
   * @defaultValue true
   */
  loop?: boolean
  /** Presses toggles from anywhere. Create one with `createToggleGroupController()`. */
  controller?: ToggleGroupController<T>
} & PrimitiveOptions

/**
 * What adapters pass on top: the toolbar the group sits in, whose arrow keys
 * and tab stop its toggles join.
 */
type ToggleGroupInternalOptions<T extends string = string> =
  ToggleGroupOptions<T> & {
    toolbar?: () => RovingScope | undefined
  }

/**
 * What `render` functions and state-based class names receive.
 * @stable
 */
type ToggleGroupState<T extends string = string> = {
  /** The pressed toggles' values. */
  value: T[]
  /** Whether several toggles can be pressed at once. */
  multiple: boolean
  /** Whether the whole group is disabled, by its `disabled` option or a disabled fieldset around it. */
  disabled: boolean
  /** The group's `orientation` option, or `"horizontal"` when it's unset or invalid. */
  orientation: ToggleGroupOrientation
}

type State = {
  value: string[]
  multiple: boolean
  deselectable: boolean
  disabled: boolean
  // Disabled by a fieldset around it.
  formDisabled: boolean
  orientation: ToggleGroupOrientation
  // The toggle that holds the tab stop, by its roving key. Null until toggles bind.
  stop: string | null
  // Whether the toolbar scope it sits in is disabled, as of its last options,
  // so toggles hear when a toolbar group around it changes.
  scopeDisabled: boolean
}

type Item = { key: string; el: HTMLElement; disabled: () => boolean }

const isGroupDisabled = (state: State) =>
  state.disabled || state.formDisabled || state.scopeDisabled

/** The value after pressing or unpressing one toggle, in document order. */
function nextValue(
  value: readonly string[],
  key: string,
  pressed: boolean,
  { multiple, order }: { multiple: boolean; order: readonly string[] }
) {
  if (!multiple) {
    return pressed ? [key] : []
  }
  const others = value.filter((item) => item !== key)
  return inOrder(pressed ? [...others, key] : others, order)
}

function toggleGroupApiBody(
  context: PrimitiveContext<ToggleGroupInternalOptions, State, string>
) {
  const { store, options } = context
  const change = createChange(context)
  // Toggles by value, for document order and focus.
  const items = createOrder<Item>()
  const ordered = items.list
  const isPressed = (key: string) => store.get().value.includes(key)

  // Tab lands on the first pressed toggle that's enabled, else the first
  // enabled one, until focus has been in the group. Then it's the one focused
  // last, like the APG toolbar. Before toggles bind, the first pressed enabled
  // toggle claims the stop, or with nothing pressed the first enabled one. In
  // a disabled group every toggle stays focusable, so the first one does, as
  // the bound check decides.
  const roving = createRovingFocus<State, RovingMember>(context, {
    slot: "toggle",
    key: "stop",
    orientation: () => store.get().orientation,
    loop: () => options().loop ?? true,
    disabled: memberDisabled,
    focusable: memberFocusable,
    preferred: (toggle) => !!toggle.props.preferred?.(),
    claims: (state, toggle) =>
      isGroupDisabled(state) ||
      (!memberDisabled(toggle) &&
        (!state.value.length || !!toggle.props.preferred?.())),
  })
  const own: RovingScope = {
    bind: roving.bind,
    claim: (toggle) => roving.tabIndex(store.get(), toggle) === "0",
    queueCheck: queued(roving.check),
    keydown(event, el) {
      if (!event.shiftKey) {
        roving.keydown(event, el)
      }
    },
    stop: () => store.get().stop,
    follow: (key, listener) => followStop(store, key, listener),
    orientation: () => store.get().orientation,
    disabled: () => isGroupDisabled(store.get()),
  }
  // A group in a toolbar is no tab stop of its own: its toggles join the toolbar's.
  const scope = () => options().toolbar?.() ?? own

  // A toolbar around the group checks its stop when toggles in it change.
  // The group's own stop follows what's pressed on its own.
  let previous = store.get()
  store.subscribe(() => {
    const state = store.get()
    if (
      scope() !== own &&
      (state.value !== previous.value ||
        isGroupDisabled(state) !== isGroupDisabled(previous) ||
        state.scopeDisabled !== previous.scopeDisabled)
    ) {
      scope().queueCheck()
    }
    previous = state
  })

  // Whether pressing or unpressing a toggle would change anything the group allows.
  function allows(key: string, pressed: boolean) {
    const { multiple, deselectable } = store.get()
    if (api.internal.disabled() || items.get(key)?.disabled()) {
      return false
    }
    if (pressed === isPressed(key)) {
      return false
    }
    return pressed || multiple || deselectable
  }

  function press(
    key: string,
    pressed: boolean,
    details: ToggleGroupChangeOptions
  ) {
    if (!allows(key, pressed)) {
      return false
    }
    const { value, multiple } = store.get()
    const order = ordered().map((item) => item.key)
    return change(
      "value",
      nextValue(value, key, pressed, { multiple, order }),
      {
        reason: details.reason ?? "imperative",
        event: details.event,
      }
    )
  }

  const api = {
    getValue: () => store.get().value,
    setValue(
      value: string[],
      { reason = "imperative", event }: ToggleGroupChangeOptions = {}
    ) {
      const order = ordered().map((item) => item.key)
      return change(
        "value",
        store.get().multiple ? inOrder(value, order) : value.slice(0, 1),
        {
          reason,
          event,
        }
      )
    },
    isPressed,
    toggle: (value: string, details: ToggleGroupChangeOptions = {}) =>
      press(value, !isPressed(value), details),
    focus(value?: string) {
      if (value !== undefined) {
        items.get(value)?.el.focus()
      } else if (scope() === own) {
        roving.focus()
      } else {
        ordered()[0]?.el.focus()
      }
    },
    internal: {
      allows,
      press,
      // A disabled toolbar disables the groups in it. Read from state, which
      // follows the toolbar the props pass now, before they're handed over.
      disabled: () => isGroupDisabled(store.get()),
      orientation: () => store.get().orientation,
      subscribe: store.subscribe,
      scope,
      // Whether a toolbar around the group holds the tab stop.
      inToolbar: () => scope() !== own,
      // Each toggle is its own instance, so the agent bridge reads a toggle's marks here.
      elementOf: (key: string) => items.get(key)?.el,
      // A toggle joins by its value, and the roving group by a key of its own,
      // which stays unique in a toolbar that holds several groups.
      register(
        key: string,
        rovingKey: string,
        el: HTMLElement,
        disabled: () => boolean
      ) {
        const remove = items.add({ key, el, disabled })
        const leave = scope().bind(el, {
          key: rovingKey,
          props: { disabled, preferred: () => isPressed(key) },
        })
        return () => {
          remove()
          leave()
        }
      },
    },
  }
  return api
}

const toggleGroupApi: (
  ...args: Parameters<typeof toggleGroupApiBody>
) => ToggleGroupApi = toggleGroupApiBody

/**
 * `toggleGroup`'s api, which its slots and controller call.
 * Adapters expose it as `api`.
 * @stable
 */
interface ToggleGroupApi extends ReturnType<typeof toggleGroupApiBody> {}

// The toggle group's types as functions of its value type `T`, so every
// renderer's `ToggleGroup` infers `T` from `value`, `defaultValue` or
// `onValueChange`.
interface ToggleGroupGeneric extends PrimitiveGeneric {
  T: string
  options: ToggleGroupInternalOptions<this["T"] & string>
  state: ToggleGroupStates<this["T"] & string>
}
type ToggleGroupStates<T extends string> = { group: ToggleGroupState<T> }

const toggleGroupPrimitive = /* @__PURE__ */ definePrimitive({
  name: "toggle",
  options: {
    value: "list",
    defaultValue: "list",
    onValueChange: "callback",
    multiple: "boolean",
    deselectable: "boolean",
    disabled: "boolean",
    orientation: "string",
    loop: "boolean",
    controller: "value",
    // Internal: passed by renderers.
    toolbar: "value",
  },
  state: (options: ToggleGroupInternalOptions): State => ({
    value: options.value ?? options.defaultValue ?? [],
    multiple: !!options.multiple,
    deselectable: options.deselectable ?? true,
    disabled: !!options.disabled,
    formDisabled: false,
    orientation: orientationOf(options.orientation, "horizontal"),
    stop: null,
    scopeDisabled: !!options.toolbar?.()?.disabled(),
  }),
  sync: (options) => ({
    multiple: !!options.multiple,
    deselectable: options.deselectable ?? true,
    disabled: !!options.disabled,
    orientation: orientationOf(options.orientation, "horizontal"),
    scopeDisabled: !!options.toolbar?.()?.disabled(),
    ...(options.value === undefined ? {} : { value: options.value }),
  }),
  api: toggleGroupApi,
  slots: (slot) => ({
    group: slot<{}, ToggleGroupState>({
      // A group, not a toolbar: a toolbar may hold one, and `aria-orientation`
      // isn't allowed on a group.
      role: "group",
      state: (state) => ({
        value: state.value,
        multiple: state.multiple,
        disabled: isGroupDisabled(state),
        orientation: state.orientation,
      }),
      attrs: (state) => ({
        "data-orientation": state.orientation,
        "data-disabled": isGroupDisabled(state) ? "" : undefined,
      }),
      bind: (el, { store }) => watchFormDisabled(el, store),
    }),
  }),
  agent: { actions: ["setValue", "toggle"], closed: true },
})
/**
 * The type of `toggleGroup`.
 * @stable
 */
interface ToggleGroupPrimitive extends WithGeneric<
  typeof toggleGroupPrimitive,
  ToggleGroupGeneric
> {}

/**
 * The toggle group primitive, with the slots `group`.
 * Render it with an adapter's `usePrimitive`, or compose it inside your own
 * primitive.
 * @stable
 */
const toggleGroup = toggleGroupPrimitive as ToggleGroupPrimitive

export {
  createToggleGroupController,
  nextValue,
  toggleGroup,
  type ToggleGroupApi,
  type ToggleGroupChangeOptions,
  type ToggleGroupController,
  type ToggleGroupGeneric,
  type ToggleGroupInternalOptions,
  type ToggleGroupOptions,
  type ToggleGroupOrientation,
  type ToggleGroupPrimitive,
  type ToggleGroupState,
  type ToggleGroupValueChangeReason,
}
