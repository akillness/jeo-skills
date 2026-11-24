import {
  buttonElement,
  buttonElementAttrs,
  buttonKeydown,
  buttonKeyup,
  buttonRole,
  type ButtonElement,
} from "../../foundation/platform/button"
import { watchFormDisabled } from "../../foundation/forms/form"
import type { RovingScope } from "../../foundation/focus/roving-scope"
import {
  itemIconPart,
  type ItemIconProps,
  type ItemIconState,
} from "../../foundation/lists/item-icon"
import { createController } from "../../foundation/kernel/controller"
import {
  createDetails,
  type ChangeDetails,
  type ChangeOptions,
} from "../../foundation/kernel/details"
import { definePrimitive } from "../../foundation/kernel/primitive"
import type {
  Named,
  PrimitiveContext,
  PrimitiveOptions,
} from "../../foundation/kernel/primitive-types"
import type { ToggleGroupApi, ToggleGroupOrientation } from "./toggle-group"
import {
  changeSource,
  createChange,
} from "../../foundation/kernel/input-source"

/**
 * Why a toggle wants to be pressed or unpressed: a press, or a controller or `api` call.
 * @stable
 */
type TogglePressedChangeReason = "press" | "imperative"

/**
 * Options for every write method on a controller.
 * @stable
 */
type ToggleChangeOptions = ChangeOptions<TogglePressedChangeReason>

/**
 * Presses and inspects a toggle from outside it. Pass it as the `controller` option.
 * @stable
 */
function createToggleController() {
  return createController<{
    /** Whether it's pressed. Inside a group, it follows the group's value. */
    isPressed: () => boolean
    /** Presses or unpresses it, as a user would. A disabled toggle ignores it. Returns false when canceled. */
    setPressed: (pressed: boolean, options?: ToggleChangeOptions) => boolean
    /** Presses it, or unpresses it. */
    toggle: (options?: ToggleChangeOptions) => boolean
    /** Moves focus to it. */
    focus: () => void
  }>()
}

/**
 * A controller from `createToggleController()`. Pass it as the `controller`
 * option.
 * @stable
 */
type ToggleController = ReturnType<typeof createToggleController>

/**
 * The options `toggle` takes. A component takes them as props on its root.
 * @stable
 */
type ToggleOptions = {
  /** Whether it's pressed. Pass it to control the toggle. Inside a group, the group's value decides. */
  pressed?: boolean
  /**
   * Whether it's pressed at first, when uncontrolled.
   * @defaultValue false
   */
  defaultPressed?: boolean
  /**
   * Runs when a press wants to change it. `details.reason` says why, and
   * `details.cancel()` stops it. Inside a group, it runs before the group's
   * `onValueChange`, and canceling it cancels the group's change too.
   */
  onPressedChange?: (
    pressed: boolean,
    details: ChangeDetails<TogglePressedChangeReason>
  ) => void
  /** Identifies the toggle inside a group, whose value lists the pressed toggles' values. Defaults to a generated id. */
  value?: string
  /**
   * Stops presses. Alone, the toggle is natively disabled, unless
   * `focusableWhenDisabled` is set. Inside a group or a toolbar, it stays
   * focusable with `aria-disabled`, so arrow keys still reach it.
   * @defaultValue false
   */
  disabled?: boolean
  /**
   * Keeps a disabled toggle in the tab order with `aria-disabled` instead of
   * the native attribute. Toggles in a group or a toolbar always are.
   * @defaultValue false
   */
  focusableWhenDisabled?: boolean
  /** Presses it from anywhere. Create one with `createToggleController()`. */
  controller?: ToggleController
} & PrimitiveOptions

/**
 * What adapters pass on top, found from context: the group a toggle belongs
 * to, or the toolbar it sits in outside a group.
 */
type ToggleInternalOptions = ToggleOptions & {
  group?: () => ToggleGroupApi | undefined
  toolbar?: () => RovingScope | undefined
}

/**
 * What `render` functions and state-based class names receive.
 * @stable
 */
type ToggleState = {
  /** Whether it's pressed. Inside a group, it follows the group's value. */
  pressed: boolean
  /** Whether it's disabled, by itself, its group or a fieldset around it. */
  disabled: boolean
}

/**
 * The props the `icon` slot of `toggle` takes.
 * @stable
 */
type ToggleIconProps = ItemIconProps
/**
 * The state the `icon` slot of `toggle` hands `render` functions and
 * state-based class names.
 * @stable
 */
type ToggleIconState = ItemIconState

type State = {
  pressed: boolean
  disabled: boolean
  // Disabled by a fieldset around it.
  formDisabled: boolean
  focusableWhenDisabled: boolean
  element: ButtonElement
  // In a group or a toolbar: whether the group is disabled, whether this
  // toggle holds the tab stop, and the orientation.
  roving: boolean
  groupDisabled: boolean
  tabStop: boolean
  orientation: ToggleGroupOrientation | undefined
}

const isDisabled = (state: State) =>
  state.disabled || state.groupDisabled || state.formDisabled
const keyOf = (options: ToggleInternalOptions & { id: string }) =>
  options.value ?? options.id

// The arrow keys and tab stop a toggle joins: its group's, or the toolbar's.
const scopeOf = (options: ToggleInternalOptions) =>
  options.group?.()?.internal.scope() ?? options.toolbar?.()

// What a toggle in a group takes from it. Creation, every render (which is how
// toggles follow before they bind, like on the server) and the group's
// changes after binding all read it here. The toggle's own toolbar scope can
// be newer than the group's, like when a toolbar group around both is disabled.
function fromGroup(
  group: ToggleGroupApi,
  key: string,
  toolbar: RovingScope | undefined
) {
  return {
    roving: true,
    focusableWhenDisabled: true,
    pressed: group.isPressed(key),
    groupDisabled: group.internal.disabled() || !!toolbar?.disabled(),
    orientation: group.internal.orientation(),
  }
}

// What a toggle in a toolbar, outside a group, takes from it.
function fromToolbar(toolbar: RovingScope) {
  return {
    roving: true,
    focusableWhenDisabled: true,
    groupDisabled: toolbar.disabled(),
    orientation: toolbar.orientation(),
  }
}

function toggleState(options: ToggleInternalOptions & { id: string }): State {
  const group = options.group?.()
  const toolbar = options.toolbar?.()
  const disabled = !!options.disabled
  const scope = scopeOf(options)
  const own = {
    pressed: options.pressed ?? options.defaultPressed ?? false,
    disabled,
    formDisabled: false,
    focusableWhenDisabled: !!options.focusableWhenDisabled,
    element: "unknown" as const,
    roving: false,
    groupDisabled: false,
    tabStop: false,
    orientation: undefined,
  }
  if (!scope) {
    return own
  }
  const joined = group
    ? fromGroup(group, keyOf(options), toolbar)
    : { ...own, ...fromToolbar(toolbar!) }
  return {
    ...own,
    ...joined,
    // Servers render before anything binds, so the first eligible toggle claims the stop.
    tabStop: scope.claim({
      key: options.id,
      props: { disabled: () => disabled, preferred: () => !!joined.pressed },
    }),
  }
}

function toggleApiBody(
  context: PrimitiveContext<ToggleInternalOptions, State, string>
) {
  const { id, store, options, element } = context
  const change = createChange(context)
  const group = () => options().group?.()
  const scope = () => scopeOf(options())
  const key = () => options().value ?? id

  const api = {
    isPressed: () => store.get().pressed,
    setPressed(
      pressed: boolean,
      { reason = "imperative", event }: ToggleChangeOptions = {}
    ) {
      if (isDisabled(store.get())) {
        return false
      }
      const owner = group()
      if (!owner) {
        return change("pressed", pressed, { reason, event })
      }
      if (!owner.internal.allows(key(), pressed)) {
        return false
      }
      // The toggle hears first and can cancel. Then the group decides, and the
      // toggle follows its value.
      const details = createDetails(
        { reason, event },
        changeSource(reason, event)
      )
      options().onPressedChange?.(pressed, details)
      if (details.canceled) {
        return false
      }
      return owner.internal.press(key(), pressed, {
        reason: reason === "press" ? "item-press" : reason,
        event,
      })
    },
    toggle: (details?: ToggleChangeOptions) =>
      api.setPressed(!store.get().pressed, details),
    focus: () => element("root")?.focus(),
    internal: {
      // Joins the group or the toolbar, and follows its value, tab stop and
      // settings from then on.
      join(el: HTMLElement) {
        const roving = scope()
        if (!roving) {
          return () => {}
        }
        const owner = group()
        const disabled = () => isDisabled(store.get())
        const follow = () => {
          const stop = roving.stop()
          // Read the toolbar's scope afresh: a toolbar group's disabled picks
          // which one the toggle sees.
          const toolbar = options().toolbar?.()
          // A web component can upgrade before its group, so this also sets what creation couldn't.
          store.set({
            ...(owner
              ? fromGroup(owner, key(), toolbar)
              : fromToolbar(toolbar ?? roving)),
            tabStop: stop === null ? store.get().tabStop : stop === id,
          })
        }
        const leave = owner
          ? owner.internal.register(key(), id, el, disabled)
          : roving.bind(el, { key: id, props: { disabled } })
        // The tab stop, which a toolbar holds for groups inside it, and then
        // the group's value and settings.
        const unfollow = [roving.follow(id, follow)]
        if (owner?.internal.inToolbar()) {
          unfollow.push(owner.internal.subscribe(follow))
        }
        // Disabling a toggle, by itself, its group or a fieldset, can move the tab stop.
        let wasDisabled = disabled()
        const unwatch = store.subscribe(() => {
          if (disabled() === wasDisabled) {
            return
          }
          wasDisabled = disabled()
          roving.queueCheck()
        })
        follow()
        return () => {
          leave()
          unfollow.forEach((stop) => stop())
          unwatch()
        }
      },
      keydown(event: KeyboardEvent, el: HTMLElement) {
        buttonKeydown(event, el)
        scope()?.keydown(event, el)
      },
    },
  }
  return api
}

const toggleApi: (...args: Parameters<typeof toggleApiBody>) => ToggleApi =
  toggleApiBody

/**
 * `toggle`'s api, which its slots and controller call. Adapters
 * expose it as `api`.
 * @stable
 */
interface ToggleApi extends ReturnType<typeof toggleApiBody> {}

const togglePrimitive = /* @__PURE__ */ definePrimitive({
  name: "toggle",
  options: {
    pressed: "boolean",
    defaultPressed: "boolean",
    onPressedChange: "callback",
    value: "string",
    disabled: "boolean",
    focusableWhenDisabled: "boolean",
    controller: "value",
    // Internal: passed by renderers.
    group: "value",
    toolbar: "value",
  },
  state: toggleState,
  controlled: ["pressed"],
  sync: (options) => {
    const group = options.group?.()
    if (group) {
      return {
        ...fromGroup(group, keyOf(options), options.toolbar?.()),
        disabled: !!options.disabled,
      }
    }
    const toolbar = options.toolbar?.()
    if (toolbar) {
      return {
        ...fromToolbar(toolbar),
        disabled: !!options.disabled,
        ...(options.pressed === undefined ? {} : { pressed: options.pressed }),
      }
    }
    return {
      disabled: !!options.disabled,
      focusableWhenDisabled: !!options.focusableWhenDisabled,
      ...(options.pressed === undefined ? {} : { pressed: options.pressed }),
    }
  },
  api: toggleApi,
  slots: (slot) => ({
    root: slot<{}, ToggleState>({
      ...buttonRole((state: State) => state.element),
      focus: "tab-stop",
      state: (state) => ({
        pressed: state.pressed,
        disabled: isDisabled(state),
      }),
      attrs: (state) => ({
        // Never "submit": a toggle changes state, it doesn't send a form.
        ...buttonElementAttrs(state.element, {
          type: "button",
          disabled: isDisabled(state),
          focusable: state.focusableWhenDisabled,
          tabindex: state.roving ? (state.tabStop ? "0" : "-1") : undefined,
        }),
        "aria-pressed": String(state.pressed),
        "data-pressed": state.pressed ? "" : undefined,
        "data-disabled": isDisabled(state) ? "" : undefined,
        "data-orientation": state.orientation,
      }),
      press({ api, el, store }, event) {
        if (isDisabled(store.get())) {
          return event?.preventDefault()
        }
        // Safari doesn't focus buttons on click, so arrow keys in a group would go nowhere.
        if (store.get().roving && el && document.activeElement !== el) {
          el.focus({ preventScroll: true })
        }
        api.toggle({ reason: "press", event })
      },
      on: {
        keydown: (event, { api, el }) => api.internal.keydown(event, el!),
        keyup: (event, { el }) => buttonKeyup(event, el!),
      },
      bind(el, { api, store }) {
        store.set({ element: buttonElement(el) })
        const cleanups = [watchFormDisabled(el, store), api.internal.join(el)]
        return () => cleanups.forEach((cleanup) => cleanup())
      },
    }),

    // An icon inside the toggle. In a group, the group gets `data-has-icons`.
    icon: slot(
      itemIconPart<State, ToggleApi>({
        component: "toggle",
        item: '[data-slot="toggle"]',
        list: '[data-slot="toggle-group"]',
      })
    ),
  }),
  agent: { actions: ["setPressed"] },
})

/**
 * The type of `toggle`.
 * @stable
 */
interface TogglePrimitive extends Named<typeof togglePrimitive> {}

/**
 * The toggle primitive, with the slots `root`, `icon`.
 * Render it with an adapter's `usePrimitive`, or compose it inside your own
 * primitive.
 * @stable
 */
const toggle: TogglePrimitive = togglePrimitive

export {
  createToggleController,
  toggle,
  type ToggleApi,
  type ToggleChangeOptions,
  type ToggleController,
  type ToggleIconProps,
  type ToggleIconState,
  type ToggleOptions,
  type TogglePressedChangeReason,
  type TogglePrimitive,
  type ToggleState,
}
export {
  createToggleGroupController,
  toggleGroup,
  type ToggleGroupApi,
  type ToggleGroupChangeOptions,
  type ToggleGroupController,
  type ToggleGroupOptions,
  type ToggleGroupOrientation,
  type ToggleGroupPrimitive,
  type ToggleGroupState,
  type ToggleGroupValueChangeReason,
} from "./toggle-group"
