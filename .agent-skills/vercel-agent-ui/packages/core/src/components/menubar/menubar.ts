import { moveIndex, orientationOf } from "../../foundation/focus/collection"
import { isRTL } from "../../foundation/platform/env"
import type { PopupOpener } from "../../foundation/popups/popup"
import { pointerModalAttribute } from "../../foundation/popups/modal-attribute"
import { createSafeArea } from "../../foundation/popups/safe-area"
import { createRovingFocus } from "../../foundation/focus/roving-focus"
import {
  createTypeahead,
  isTypeaheadKey,
  labelOf,
} from "../../foundation/text/typeahead"
import type {
  MenuOpenChangeReason,
  MenuPayloadChangeReason,
} from "../menu/menu"
import { createController } from "../../foundation/kernel/controller"
import type { ChangeOptions } from "../../foundation/kernel/details"
import { definePrimitive } from "../../foundation/kernel/primitive"
import type {
  Named,
  PrimitiveContext,
  PrimitiveOptions,
} from "../../foundation/kernel/primitive-types"

/**
 * Opens, closes and focuses a menubar's menus from outside it, like the F10
 * shortcut desktop apps give their menubars. Pass it as the `controller` option.
 * @stable
 */
function createMenubarController() {
  return createController<{
    /** Moves focus to the trigger that holds the menubar's tab stop: the one used last, or the first. */
    focus: () => void
    /** Whether one of its menus is open. */
    isOpen: () => boolean
    /**
     * Closes the open menu, if any, and its submenus.
     * Returns false when the close was canceled or it was already closed.
     */
    close: (options?: ChangeOptions<MenuOpenChangeReason>) => boolean
  }>()
}

/**
 * A controller from `createMenubarController()`. Pass it as the `controller`
 * option.
 * @stable
 */
type MenubarController = ReturnType<typeof createMenubarController>

/**
 * Which way the menubar runs, which picks the arrow keys that move between its
 * menus.
 * @stable
 */
type MenubarOrientation = "horizontal" | "vertical"

/**
 * The options `menubar` takes. A component takes them as props on its root.
 * @stable
 */
type MenubarOptions = {
  /**
   * Which arrow keys move between menus: left and right, or up and down. A
   * vertical menubar opens its menus to the side.
   * @defaultValue "horizontal"
   */
  orientation?: MenubarOrientation
  /**
   * Whether arrow keys wrap from the last menu to the first, between triggers
   * and between open menus.
   * @defaultValue true
   */
  loop?: boolean
  /**
   * Stops every menu from opening. Triggers stay focusable with
   * `aria-disabled`, so the menubar keeps its tab stop and stays discoverable.
   * @defaultValue false
   */
  disabled?: boolean
  /**
   * The `modal` setting of every menu in the menubar that doesn't set its own.
   * `"pointer"`: an outside press only closes the open menu. `true`: also locks
   * scroll, traps focus and makes the rest of the page inert, except the menubar.
   * `false`: outside presses reach what they hit.
   * @defaultValue "pointer"
   */
  modal?: boolean | "pointer"
  /** Opens, closes and focuses the menubar from anywhere. Create one with `createMenubarController()`. */
  controller?: MenubarController
} & PrimitiveOptions

/**
 * What `render` functions and state-based class names receive.
 * @stable
 */
type MenubarState = {
  /** Which arrow keys move between menus, from the `orientation` option. A vertical menubar opens its menus to the side. */
  orientation: MenubarOrientation
  /** Whether the whole menubar is disabled. */
  disabled: boolean
  /** Whether one of its menus is open. */
  open: boolean
  /** The modal setting its menus inherit. */
  modal: boolean | "pointer"
}

/**
 * What a menubar sees of each menu in it. Menus join from their trigger.
 * @stable
 */
type MenubarMember = {
  isOpen: () => boolean
  disabled: () => boolean
  open: (options: {
    focus: "first" | "last" | "popup"
    reason: MenuPayloadChangeReason
    event?: Event
    by?: PopupOpener
  }) => void
  close: (options: {
    reason: MenuOpenChangeReason
    event?: Event
    focus: boolean
  }) => boolean
}

type State = {
  orientation: MenubarOrientation
  disabled: boolean
  modal: boolean | "pointer"
  // The trigger that holds the tab stop, by its menu's id. Null until triggers bind.
  stop: string | null
  // The open menu's id.
  open: string | null
}

function menubarApiBody(
  context: PrimitiveContext<MenubarOptions, State, string>
) {
  const { store, options, element } = context
  const members = new Map<string, MenubarMember>()
  const typeahead = createTypeahead()
  const orientation = () => store.get().orientation
  const loop = () => options().loop ?? true

  // Tab lands on the first enabled trigger, then on the one used last. Before
  // triggers bind, the first enabled one claims the stop, so servers render
  // one. In a disabled menubar every trigger is disabled and stays focusable,
  // so the first one does.
  const roving = createRovingFocus<State, { disabled?: boolean }>(context, {
    slot: "trigger",
    key: "stop",
    orientation,
    loop,
    claims: (state, trigger) => state.disabled || !trigger.props.disabled,
  })

  // Pointing at a disabled trigger closes the open menu, but the menubar stays
  // in menu mode while that trigger has focus, so the next trigger pointed at
  // opens its menu. Escape and focus leaving the trigger end it.
  let held: HTMLElement | null = null
  const release = (event: Event) => {
    if (event.target === held) {
      held = null
    }
  }

  // Crossing other triggers on the way to the open menu doesn't switch to them.
  const aim = createSafeArea()
  let pointerOn: string | null = null

  const openMember = () => {
    const open = store.get().open
    return open === null ? undefined : members.get(open)
  }

  // Moves focus to the trigger `next`, opening its menu when `open` says so.
  // A disabled menu takes focus on its trigger instead, and the open menu closes.
  function moveTo(
    next: { key: string; el: HTMLElement } | undefined,
    event: Event,
    open: boolean
  ) {
    if (!next) {
      return
    }
    const member = members.get(next.key)
    if (open && member && !member.disabled()) {
      member.open({ focus: "first", reason: "trigger-press", event })
    } else if (
      openMember()?.close({ reason: "submenu-switch", event, focus: false }) !==
      false
    ) {
      next.el.focus()
    }
    // A menu that refused to close keeps the menubar where it was.
    const current = store.get().open
    if (current === null || current === next.key) {
      roving.remember(next.key)
    }
  }

  const api = {
    focus: () => roving.focus(),
    isOpen: () => store.get().open !== null,
    close: ({
      reason = "imperative",
      event,
    }: ChangeOptions<MenuOpenChangeReason> = {}) =>
      openMember()?.close({ reason, event, focus: true }) ?? false,
    internal: {
      orientation,
      disabled: () => store.get().disabled,
      modal: () => store.get().modal,
      stop: () => store.get().stop,
      subscribe: store.subscribe,
      element: () => element("root"),
      isStop: (key: string, enabled: boolean) =>
        roving.tabIndex(store.get(), { key, props: { disabled: !enabled } }) ===
        "0",
      join(key: string, el: HTMLElement, member: MenubarMember) {
        members.set(key, member)
        const leave = roving.bind(el, { key, props: {} })
        return () => {
          if (members.get(key) === member) {
            members.delete(key)
          }
          leave()
        }
      },
      // Whether a press lands on one of the menubar's triggers, which never
      // counts as outside its open menu: it switches menus instead.
      onTrigger: (target: Node) =>
        roving.items().some((item) => item.el.contains(target)),
      // One menu is open at a time. Another opening closes it, unless it refuses.
      opening: (key: string, event?: Event) =>
        [...members].every(
          ([other, member]) =>
            other === key ||
            !member.isOpen() ||
            member.close({ reason: "submenu-switch", event, focus: false })
        ),
      openChanged(key: string, open: boolean) {
        aim.stop()
        if (open) {
          held = null
          store.set({ open: key })
        } else if (store.get().open === key) {
          store.set({ open: null })
        }
      },
      // Left and Right inside an open menu, on an item without a submenu. A
      // horizontal menubar opens the neighbouring menu at its first item, as
      // the APG asks, and returns "moved". A vertical one opens its menus to
      // the side, so the key back toward the menubar returns "close", for the
      // menu to close like a submenu, and the other does nothing.
      menuArrow(key: string, by: 1 | -1, event: Event) {
        if (orientation() === "vertical") {
          return by === -1 ? ("close" as const) : undefined
        }
        const list = roving.items()
        const index = list.findIndex((item) => item.key === key)
        const next = list[moveIndex(index, by, list.length, loop())]
        if (next && next.key !== key) {
          moveTo(next, event, true)
        }
        return "moved" as const
      },
      // Keys on a trigger. Arrows along the menubar, Home, End and typeahead
      // move between triggers, and a menu open from the trigger moves along.
      // Returns where focus goes when the key opens the trigger's menu: the
      // arrow across the menubar, Enter and Space open it at its first item,
      // and Up at its last.
      triggerKeydown(
        event: KeyboardEvent,
        key: string,
        el: HTMLElement,
        disabled: boolean
      ) {
        if (event.key === "Escape") {
          held = null
        }
        const wasOpen = members.get(key)?.isOpen() ?? false
        const moved = event.shiftKey ? undefined : roving.keydown(event, el)
        if (moved) {
          if (wasOpen && moved.key !== moved.from) {
            moveTo(
              roving.items().find((item) => item.key === moved.key),
              event,
              true
            )
          }
          return
        }
        if (
          event.defaultPrevented ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey
        ) {
          return
        }
        if (isTypeaheadKey(event) && event.key !== " ") {
          const list = roving.items()
          const found = typeahead(
            event.key,
            list.map((item) => labelOf(item.el)),
            list.findIndex((item) => item.key === key)
          )
          if (found === -1) {
            return
          }
          event.preventDefault()
          return moveTo(list[found], event, wasOpen)
        }
        if (disabled) {
          return
        }
        const vertical = orientation() === "vertical"
        const first = vertical
          ? event.key === (isRTL(el) ? "ArrowLeft" : "ArrowRight")
          : event.key === "ArrowDown"
        const last = !vertical && event.key === "ArrowUp"
        // Native buttons press themselves.
        const activate =
          el.tagName !== "BUTTON" &&
          (event.key === "Enter" || event.key === " ")
        if (!first && !last && !activate) {
          return
        }
        event.preventDefault()
        return last ? ("last" as const) : ("first" as const)
      },
      // While a menu is open, resting the pointer on another trigger switches
      // to its menu, like a desktop menubar.
      hover(key: string, event: PointerEvent) {
        const open = store.get().open
        const member = members.get(key)
        if (
          (open === null && !held) ||
          open === key ||
          !member ||
          event.pointerType === "touch"
        ) {
          return
        }
        pointerOn = key
        const rested = () => pointerOn === key && api.internal.hover(key, event)
        if (aim.contains({ x: event.clientX, y: event.clientY }, rested)) {
          return
        }
        aim.stop()
        if (member.disabled()) {
          const next = roving.items().find((item) => item.key === key)
          if (!next) {
            return
          }
          moveTo(next, event, false)
          if (store.get().open !== null) {
            return
          }
          held = next.el
          next.el.addEventListener("blur", release, { once: true })
          return
        }
        roving.remember(key)
        member.open({
          focus: "popup",
          reason: "trigger-hover",
          event,
          by: "pointer",
        })
      },
      hoverMove(key: string, event: PointerEvent) {
        if (aim.active()) {
          api.internal.hover(key, event)
        }
      },
      leave(key: string, event: PointerEvent, menu: HTMLElement | undefined) {
        if (pointerOn === key) {
          pointerOn = null
        }
        if (store.get().open !== key || !menu) {
          return
        }
        aim.start(
          { x: event.clientX, y: event.clientY },
          menu,
          orientation() === "vertical" ? "x" : "y"
        )
      },
      enterMenu: () => aim.stop(),
    },
  }
  return api
}

const menubarApi: (...args: Parameters<typeof menubarApiBody>) => MenubarApi =
  menubarApiBody

/**
 * `menubar`'s api, which its slots and controller call.
 * Adapters expose it as `api`.
 * @stable
 */
interface MenubarApi extends ReturnType<typeof menubarApiBody> {}

const menubarPrimitive = /* @__PURE__ */ definePrimitive({
  name: "menubar",
  options: {
    orientation: "string",
    loop: "boolean",
    disabled: "boolean",
    modal: pointerModalAttribute,
    controller: "value",
  },
  state: (options: MenubarOptions): State => ({
    orientation: orientationOf(options.orientation, "horizontal"),
    disabled: !!options.disabled,
    modal: options.modal ?? "pointer",
    stop: null,
    open: null,
  }),
  // Nothing here is a controllable `open`.
  controlled: [],
  sync: (options) => ({
    orientation: orientationOf(options.orientation, "horizontal"),
    disabled: !!options.disabled,
    modal: options.modal ?? "pointer",
  }),
  api: menubarApi,
  slots: (slot) => ({
    root: slot<{}, MenubarState>({
      role: "menubar",
      keys: {
        none: "Each menu's trigger, an item of the menubar, handles them.",
      },
      state: (state) => ({
        orientation: state.orientation,
        disabled: state.disabled,
        open: state.open !== null,
        modal: state.modal,
      }),
      attrs: (state) => ({
        "aria-orientation": state.orientation,
        "data-orientation": state.orientation,
        "data-disabled": state.disabled ? "" : undefined,
        "data-open": state.open !== null ? "" : undefined,
      }),
    }),
  }),
  agent: { actions: ["close"] },
})

/**
 * The type of `menubar`.
 * @stable
 */
interface MenubarPrimitive extends Named<typeof menubarPrimitive> {}

/**
 * The menubar primitive, with the slots `root`.
 * Render it with an adapter's `usePrimitive`, or compose it inside your own
 * primitive.
 * @stable
 */
const menubar: MenubarPrimitive = menubarPrimitive

export {
  createMenubarController,
  menubar,
  type MenubarApi,
  type MenubarController,
  type MenubarMember,
  type MenubarOptions,
  type MenubarOrientation,
  type MenubarPrimitive,
  type MenubarState,
}
