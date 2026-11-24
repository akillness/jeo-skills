import { watchFormDisabled } from "../../foundation/forms/form"
import { flagWhileBound } from "../../foundation/kernel/bound-keys"
import {
  buttonElement,
  buttonElementAttrs,
  buttonKeydown,
  buttonKeyup,
  buttonRole,
  type ButtonElement,
} from "../../foundation/platform/button"
import { stepFor } from "../../foundation/focus/collection"
import { isRTL } from "../../foundation/platform/env"
import {
  followStop,
  memberDisabled,
  memberFocusable,
  queued,
  type RovingMember,
  type RovingScope,
} from "../../foundation/focus/roving-scope"
import { fieldKeeps, placeCaret } from "./toolbar-fields"
import { createRovingFocus } from "../../foundation/focus/roving-focus"
import { createController } from "../../foundation/kernel/controller"
import { definePrimitive } from "../../foundation/kernel/primitive"
import type {
  Named,
  Part,
  PrimitiveContext,
  PrimitiveOptions,
} from "../../foundation/kernel/primitive-types"
import { onProps } from "../../foundation/kernel/part"
import { selects } from "../../foundation/kernel/selects"

/**
 * Focuses a toolbar from outside it, like the Alt+F10 shortcut editors give
 * their toolbars. Pass it as the `controller` option.
 * @stable
 */
function createToolbarController() {
  return createController<{
    /** Moves focus to the item that holds the toolbar's tab stop: the one focused last, or the first. */
    focus: () => void
  }>()
}

/**
 * A controller from `createToolbarController()`. Pass it as the `controller`
 * option.
 * @stable
 */
type ToolbarController = ReturnType<typeof createToolbarController>

/**
 * Which way the toolbar runs, which picks the arrow keys that move between its
 * items.
 * @stable
 */
type ToolbarOrientation = "horizontal" | "vertical"

/**
 * The options `toolbar` takes. A component takes them as props on its root.
 * @stable
 */
type ToolbarOptions = {
  /**
   * Which arrow keys move between items: left and right, or up and down.
   * @defaultValue "horizontal"
   */
  orientation?: ToolbarOrientation
  /**
   * Whether arrow keys wrap from the last item to the first.
   * @defaultValue true
   */
  loop?: boolean
  /**
   * Stops every item from being used. Items stay focusable with
   * `aria-disabled`, so the toolbar keeps its tab stop and stays discoverable.
   * @defaultValue false
   */
  disabled?: boolean
  /** Focuses the toolbar from anywhere. Create one with `createToolbarController()`. */
  controller?: ToolbarController
} & PrimitiveOptions

type ItemProps = {
  /**
   * Stops the item from being used. It stays focusable with `aria-disabled`,
   * so arrow keys still reach it and a tooltip can say why.
   * @defaultValue false
   */
  disabled?: boolean
  /**
   * Whether a disabled item stays reachable with arrow keys. Turn it off to
   * skip it, natively disabled.
   * @defaultValue true
   */
  focusableWhenDisabled?: boolean
  /** @internal Whether the group the item sits in is disabled. Set by each framework. */
  groupDisabled?: boolean
}

type GroupProps = {
  /**
   * Disables every item in the group. They stay focusable with `aria-disabled`.
   * @defaultValue false
   */
  disabled?: boolean
}

/**
 * The props the `button` slot of `toolbar` takes.
 * @stable
 */
type ToolbarButtonProps = Omit<ItemProps, "groupDisabled">
/**
 * The props the `input` slot of `toolbar` takes.
 * @stable
 */
type ToolbarInputProps = Omit<ItemProps, "groupDisabled">
/**
 * The props the `group` slot of `toolbar` takes.
 * @stable
 */
type ToolbarGroupProps = GroupProps

/**
 * The state the `root` slot of `toolbar` hands `render` functions and
 * state-based class names.
 * @stable
 */
type ToolbarState = {
  /** The toolbar's `orientation` option: `"vertical"`, or `"horizontal"` for anything else. */
  orientation: ToolbarOrientation
  /** Whether the whole toolbar is disabled, by its `disabled` option or a disabled fieldset around it. */
  disabled: boolean
}
/**
 * The state the `button` slot of `toolbar` hands `render` functions and
 * state-based class names.
 * @stable
 */
type ToolbarButtonState = {
  /** Whether the item is disabled, by itself, its group or the toolbar. */
  disabled: boolean
  /** The toolbar's `orientation` option: `"vertical"`, or `"horizontal"` for anything else. */
  orientation: ToolbarOrientation
}
/**
 * The state the `link` slot of `toolbar` hands `render` functions and
 * state-based class names.
 * @stable
 */
type ToolbarLinkState = {
  /** Whether the link is disabled, by its group or the toolbar. */
  disabled: boolean
  /** The toolbar's `orientation` option: `"vertical"`, or `"horizontal"` for anything else. */
  orientation: ToolbarOrientation
}
/**
 * The state the `input` slot of `toolbar` hands `render` functions and
 * state-based class names.
 * @stable
 */
type ToolbarInputState = ToolbarButtonState
/**
 * The state the `group` slot of `toolbar` hands `render` functions and
 * state-based class names.
 * @stable
 */
type ToolbarGroupState = {
  /** Whether the group is disabled, by itself or the toolbar. */
  disabled: boolean
  /** The toolbar's `orientation` option: `"vertical"`, or `"horizontal"` for anything else. */
  orientation: ToolbarOrientation
}
/**
 * The state the `separator` slot of `toolbar` hands `render` functions and
 * state-based class names.
 * @stable
 */
type ToolbarSeparatorState = {
  /** Which way the line runs: across the toolbar, so vertical in a horizontal toolbar. */
  orientation: ToolbarOrientation
}

type State = {
  orientation: ToolbarOrientation
  disabled: boolean
  // Disabled by a fieldset around it.
  formDisabled: boolean
  // The item that holds the tab stop. Null until items bind.
  stop: string | null
  // Buttons rendered as something else, like a link, by key. Known once they bind.
  elements: Record<string, ButtonElement>
  // Until the root binds, as on a server, an item without an entry may be anything.
  bound: boolean
}

const elementOf = (state: State, key: string) =>
  state.elements[key] ?? (state.bound ? "button" : "unknown")
const across = (orientation: ToolbarOrientation) =>
  orientation === "horizontal" ? "vertical" : "horizontal"
const isToolbarDisabled = (state: State) => state.disabled || state.formDisabled
const isDisabled = (state: State, props: ItemProps) =>
  !!(props.disabled || props.groupDisabled || isToolbarDisabled(state))
const isFocusable = (state: State, props: ItemProps) =>
  !isDisabled(state, props) || (props.focusableWhenDisabled ?? true)

// Keys that would use a disabled item, or a component rendered through it,
// like Down opening a menu. Arrows that move between items still move.
const usingKeys = new Set([
  "Enter",
  " ",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
])

function toolbarApiBody(
  context: PrimitiveContext<ToolbarOptions, State, string>
) {
  const { store, options, props } = context
  const orientation = () => store.get().orientation

  // Tab lands on the first enabled item, then on the one focused last, as the
  // APG toolbar suggests. Before items bind, the first enabled one claims the
  // stop, so servers render one. Disabling the toolbar changes its state, so
  // the stop moves on its own. A pressed toggle doesn't take the stop: Tab
  // lands where the toolbar's rules put it.
  const roving = createRovingFocus<State, RovingMember>(context, {
    slot: "button",
    key: "stop",
    orientation,
    loop: () => options().loop ?? true,
    disabled: memberDisabled,
    focusable: memberFocusable,
  })
  // Text fields, which keep the arrows that move their caret.
  const fields = new Map<HTMLElement, (event: KeyboardEvent) => boolean>()

  // Moves focus for a key pressed on an item. A text field focus moves into
  // gets its caret at the end the move pointed to.
  function move(event: KeyboardEvent, el: HTMLElement) {
    if (event.shiftKey || fields.get(el)?.(event)) {
      return
    }
    const moved = roving.keydown(event, el)
    const next =
      moved &&
      moved.key !== moved.from &&
      roving.items().find((item) => item.key === moved.key)
    if (!next) {
      return
    }
    const step = stepFor(event.key, orientation(), isRTL(el))
    placeCaret(
      next.el,
      step === "last" || (typeof step === "number" && step > 0)
    )
  }

  // What toggles and toggle groups inside see.
  const scope: RovingScope = {
    bind: roving.bind,
    claim: (item) => roving.tabIndex(store.get(), item) === "0",
    queueCheck: queued(roving.check),
    keydown: move,
    stop: () => store.get().stop,
    follow: (key, listener) => followStop(store, key, listener),
    orientation,
    disabled: () => isToolbarDisabled(store.get()),
  }
  // What toggles inside a disabled group see. The scope is all they know of
  // the toolbar, so the group's disabled reaches them as the toolbar's.
  const disabledScope: RovingScope = { ...scope, disabled: () => true }

  const itemProps = (slot: string, key: string) =>
    (props(slot, key) ?? {}) as ItemProps

  // Joins an item. A disabled one keeps focus and moves between items, but
  // presses and keys never reach it or a component rendered through it, like
  // a menu trigger. Capturing them on the item stops them before any handler.
  function join(
    part: Part,
    el: HTMLElement,
    keeps?: (event: KeyboardEvent) => boolean
  ) {
    const { slot, key } = part
    const disabled = () => isDisabled(store.get(), itemProps(slot, key))
    const focusable = () => isFocusable(store.get(), itemProps(slot, key))
    const leave = roving.bind(el, { key, props: { disabled, focusable } })
    // A prop that disables the item, its own or its group's, can move the stop.
    let rules = [disabled(), focusable()]
    const unwatch = onProps(part, () => {
      if (rules[0] === disabled() && rules[1] === focusable()) {
        return
      }
      rules = [disabled(), focusable()]
      scope.queueCheck()
    })
    if (keeps) {
      fields.set(el, keeps)
    }
    const refuse = (event: Event) => {
      if (!disabled()) {
        return
      }
      if (event instanceof KeyboardEvent) {
        if (!usingKeys.has(event.key)) {
          return
        }
        move(event, el)
        // A disabled field still moves its caret for the arrows it keeps, so
        // they reach the end an arrow leaves from, as in a read-only field.
        if (!keeps?.(event)) {
          event.preventDefault()
        }
        event.stopImmediatePropagation()
        return
      }
      // A press still focuses the item, like any focusable disabled control.
      if (event.type !== "pointerdown") {
        event.preventDefault()
      }
      event.stopImmediatePropagation()
    }
    const types = ["click", "pointerdown", "keydown"] as const
    for (const type of types) {
      el.addEventListener(type, refuse, true)
    }
    return () => {
      unwatch()
      leave()
      if (fields.get(el) === keeps) {
        fields.delete(el)
      }
      for (const type of types) {
        el.removeEventListener(type, refuse, true)
      }
    }
  }

  return {
    focus: () => roving.focus(),
    internal: {
      orientation,
      scope,
      // The scope for toggles and toggle groups in a group, disabled or not.
      scopeIn: (groupDisabled: boolean) =>
        groupDisabled ? disabledScope : scope,
      join,
      isStop: (key: string, enabled: boolean) =>
        roving.tabIndex(store.get(), {
          key,
          props: { disabled: () => !enabled },
        }) === "0",
      // Arrow keys from any item, after the item's own handlers, so a component
      // rendered through it, like a number field, keeps the keys it uses.
      keydown: (event: KeyboardEvent) =>
        move(event, event.target as HTMLElement),
      setElement(key: string, el: HTMLElement) {
        const element = buttonElement(el)
        const { elements } = store.get()
        if ((elements[key] ?? "button") !== element) {
          store.set({ elements: { ...elements, [key]: element } })
        }
      },
    },
  }
}

const toolbarApi: (...args: Parameters<typeof toolbarApiBody>) => ToolbarApi =
  toolbarApiBody

/**
 * `toolbar`'s api, which its slots and controller call.
 * Adapters expose it as `api`.
 * @stable
 */
interface ToolbarApi extends ReturnType<typeof toolbarApiBody> {}

// The tab stop and data every item renders.
function itemAttrs(
  state: State,
  key: string,
  props: ItemProps,
  api: ToolbarApi
) {
  const disabled = isDisabled(state, props)
  const focusable = isFocusable(state, props)
  return {
    disabled,
    focusable,
    tabindex: focusable
      ? api.internal.isStop(key, !disabled)
        ? "0"
        : "-1"
      : undefined,
    data: {
      "data-disabled": disabled ? "" : undefined,
      "data-orientation": state.orientation,
    },
  }
}

// Every option is controlled. A custom element passes `orientation` as written,
// so anything but "vertical" is the default rather than an invalid ARIA value.
const fromOptions = (options: ToolbarOptions) => ({
  orientation:
    options.orientation === "vertical"
      ? ("vertical" as const)
      : ("horizontal" as const),
  disabled: !!options.disabled,
})

const toolbarPrimitive = /* @__PURE__ */ definePrimitive({
  name: "toolbar",
  options: {
    orientation: "string",
    loop: "boolean",
    disabled: "boolean",
    controller: "value",
  },
  state: (options: ToolbarOptions): State => ({
    ...fromOptions(options),
    formDisabled: false,
    stop: null,
    elements: {},
    bound: false,
  }),
  sync: fromOptions,
  api: toolbarApi,
  slots: (slot) => ({
    root: slot<{}, ToolbarState>({
      role: "toolbar",
      keys: (state) => [
        ...(state.orientation === "vertical"
          ? ["ArrowUp", "ArrowDown"]
          : ["ArrowLeft", "ArrowRight"]),
        "Home",
        "End",
      ],
      state: (state) => ({
        orientation: state.orientation,
        disabled: isToolbarDisabled(state),
      }),
      attrs: (state) => ({
        "aria-orientation": state.orientation,
        "data-orientation": state.orientation,
        "data-disabled": isToolbarDisabled(state) ? "" : undefined,
      }),
      on: {
        keydown: (event, { api }) => api.internal.keydown(event),
      },
      bind: (el, { store }) => {
        const cleanups = [
          flagWhileBound(store, "bound", { now: true }),
          watchFormDisabled(el, store),
        ]
        return () => cleanups.forEach((cleanup) => cleanup())
      },
    }),

    button: slot<ItemProps, ToolbarButtonState>({
      ...buttonRole<State>((state, { key }) => elementOf(state, key)),
      focus: "roving",
      press: {
        none: "The author's click does the work, and Enter and Space on other elements send one.",
      },
      props: {
        id: "id",
        disabled: "boolean",
        focusableWhenDisabled: "boolean",
        // From the group the item sits in.
        groupDisabled: { kind: "boolean", from: "group.disabled" },
      },
      // Buttons rendered as other elements record which in `elements`, each
      // reading only its own entry.
      selects: selects({
        stop: ({ key }) => [key, null],
        elements: ({ key }) => [key],
      }),
      state: (state, { props }) => ({
        disabled: isDisabled(state, props),
        orientation: state.orientation,
      }),
      attrs: (state, { key, props, api }) => {
        const item = itemAttrs(state, key, props, api)
        return {
          ...buttonElementAttrs(elementOf(state, key), {
            type: "button",
            disabled: item.disabled,
            focusable: item.focusable,
            tabindex: item.tabindex,
          }),
          ...item.data,
        }
      },
      on: {
        keydown: (event, { el }) => buttonKeydown(event, el!),
        keyup: (event, { el }) => buttonKeyup(event, el!),
      },
      bind(el, part) {
        part.api.internal.setElement(part.key, el)
        return part.api.internal.join(part, el)
      },
    }),

    link: slot<Pick<ItemProps, "groupDisabled">, ToolbarLinkState>({
      props: {
        id: "id",
        groupDisabled: { kind: "boolean", from: "group.disabled" },
      },
      selects: selects({
        stop: ({ key }) => [key, null],
        elements: [],
        bound: [],
      }),
      state: (state, { props }) => ({
        disabled: isDisabled(state, props),
        orientation: state.orientation,
      }),
      attrs: (state, { key, props, api }) => {
        const item = itemAttrs(state, key, props, api)
        return {
          tabindex: item.tabindex,
          "aria-disabled": item.disabled ? "true" : undefined,
          ...item.data,
        }
      },
      bind: (el, part) => part.api.internal.join(part, el),
    }),

    // A text field. Arrows move its caret, and leave it only from the end they point at.
    input: slot<ItemProps, ToolbarInputState>({
      props: {
        id: "id",
        disabled: "boolean",
        focusableWhenDisabled: "boolean",
        // From the group the item sits in.
        groupDisabled: { kind: "boolean", from: "group.disabled" },
      },
      selects: selects({
        stop: ({ key }) => [key, null],
        elements: [],
        bound: [],
      }),
      state: (state, { props }) => ({
        disabled: isDisabled(state, props),
        orientation: state.orientation,
      }),
      attrs: (state, { key, props, api }) => {
        const item = itemAttrs(state, key, props, api)
        const native = item.disabled && !item.focusable
        return {
          tabindex: item.tabindex,
          disabled: native ? "" : undefined,
          // A field that keeps focus while disabled can't be edited either.
          readonly: item.disabled && !native ? "" : undefined,
          "aria-disabled": item.disabled && !native ? "true" : undefined,
          ...item.data,
        }
      },
      bind: (el, part) =>
        part.api.internal.join(part, el, (event) => fieldKeeps(event, el)),
    }),

    group: slot<GroupProps, ToolbarGroupState>({
      role: "group",
      props: { id: "id", disabled: "boolean" },
      state: (state, { props }) => ({
        disabled: !!props.disabled || isToolbarDisabled(state),
        orientation: state.orientation,
      }),
      attrs: (state, { props }) => ({
        "data-disabled":
          props.disabled || isToolbarDisabled(state) ? "" : undefined,
        "data-orientation": state.orientation,
      }),
    }),

    separator: slot<{}, ToolbarSeparatorState>({
      role: "separator",
      state: (state) => ({ orientation: across(state.orientation) }),
      attrs: (state) => ({
        "aria-orientation": across(state.orientation),
        "data-orientation": across(state.orientation),
      }),
    }),
  }),
})

/**
 * The type of `toolbar`.
 * @stable
 */
interface ToolbarPrimitive extends Named<typeof toolbarPrimitive> {}

/**
 * The toolbar primitive, with the slots `root`, `button`, `link`, `input`,
 * `group`, `separator`.
 * Render it with an adapter's `usePrimitive`, or compose it inside your own
 * primitive.
 * @stable
 */
const toolbar: ToolbarPrimitive = toolbarPrimitive

export {
  createToolbarController,
  toolbar,
  type ToolbarApi,
  type ToolbarButtonProps,
  type ToolbarButtonState,
  type ToolbarController,
  type ToolbarGroupProps,
  type ToolbarGroupState,
  type ToolbarInputProps,
  type ToolbarInputState,
  type ToolbarLinkState,
  type ToolbarOptions,
  type ToolbarOrientation,
  type ToolbarPrimitive,
  type ToolbarState,
  type ToolbarSeparatorState,
}
