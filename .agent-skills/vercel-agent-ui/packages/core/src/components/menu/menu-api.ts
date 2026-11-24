import { type Layer } from "../../foundation/platform/layers"
import type { MenubarApi } from "../menubar/menubar"
import type { ButtonElement } from "../../foundation/platform/button"
import { isRTL } from "../../foundation/platform/env"
import {
  activeElement,
  composedClosest,
  composedContains,
} from "../../foundation/platform/platform"
import {
  createPopup,
  type PopupState,
} from "../../foundation/popups/create-popup"
import { contentAnchor } from "../../foundation/popups/popup-features"
import { menuPreset } from "../../foundation/popups/popup-presets"
import {
  deriveOpen,
  modalTriple,
  openerOf,
  type PopupOpener,
  type PopupOpenOptions,
  type PopupResult,
} from "../../foundation/popups/popup"
import type { createOpenSteps } from "../../foundation/popups/popup-steps"
import {
  type Anchor,
  type PortalProps,
  type PositionProps,
} from "../../foundation/platform/position"
import { sheetModal } from "../../foundation/popups/presentation"
import { announcePending, isPromise } from "../../foundation/kernel/action"
import { createOrder } from "../../foundation/kernel/order"
import { createSafeArea } from "../../foundation/popups/safe-area"
import { sourceOf } from "../../foundation/kernel/modality"
import { createTypeahead } from "../../foundation/text/typeahead"
import {
  createDetails,
  type ChangeDetails,
  withSource,
} from "../../foundation/kernel/details"
import { on } from "../../foundation/kernel/events"
import type { PrimitiveContext } from "../../foundation/kernel/primitive-types"
import type { Store } from "../../foundation/kernel/store"
import { shortcuts as shortcutManager } from "../../foundation/shortcuts/shortcuts"
import { changeSource } from "../../foundation/kernel/input-source"
import { elements } from "../../foundation/kernel/elements"

import type {
  MenuCheckedChangeReason,
  MenuData,
  MenuFinalFocus,
  MenuOpenChangeReason,
  MenuOptions,
  MenuOpenOptions,
  MenuPayloadChangeReason,
  MenuValueChangeReason,
} from "./menu"

type Focus = "first" | "last" | "popup" | "none"
type Presentation = "popover" | "sheet"

type Entry = {
  el: HTMLElement
  key: string
  kind: "item" | "checkbox" | "radio" | "submenu"
  label: () => string
  disabled: () => boolean
  activate: (event?: Event) => void
  // Submenu triggers only.
  openSubmenu?: (
    focus: Focus,
    reason: MenuPayloadChangeReason,
    event?: Event
  ) => void
}

type ItemProps = {
  /** Passed to `onAction` when the item runs. */
  value?: string
  /**
   * The text typeahead matches, when the content isn't plain text. It isn't the accessible name: use `aria-label` for that.
   */
  label?: string
  /** Keeps the item focusable but stops it from running, as the menu pattern asks. Sets `data-disabled` and `aria-disabled`. */
  disabled?: boolean
  /** Styles the item as dangerous, like Delete. Sets `data-destructive`. */
  destructive?: boolean
  /** A keyboard shortcut like `"mod+n"`. Shows `⌘N` on Apple platforms and `Ctrl+N` elsewhere, and sets `aria-keyshortcuts`. */
  shortcut?: string
  /**
   * Whether running the item closes the menu.
   * @defaultValue true
   */
  closeOnSelect?: boolean
  /**
   * Runs when the item is selected, by pointer or keyboard, with the event that selected it, or a
   * new `select` Event when no DOM event did. Call `event.preventDefault()` to keep the menu open
   * and skip `onAction`. Return a Promise to mark the item pending until it settles, like `onAction`.
   */
  onSelect?: (event: Event) => unknown
}

type TriggerProps = {
  /**
   * Stops the trigger from opening the menu. A native button can't be focused or pressed, unless `focusableWhenDisabled` is set.
   * @defaultValue false
   */
  disabled?: boolean
  /**
   * Keeps a disabled trigger in the tab order with `aria-disabled` instead of the native attribute, so it can host a tooltip that says why. Presses still do nothing.
   * @defaultValue false
   */
  focusableWhenDisabled?: boolean
  /** Data for the content to render when this trigger opens the menu, like the row it belongs to. */
  payload?: unknown
  /** A keyboard shortcut that opens the menu from anywhere, like `"mod+j"`. `mod` is Command on Apple platforms and Control elsewhere. Sets `aria-keyshortcuts`. */
  shortcut?: string
}

type SubTriggerProps = {
  /** Keeps the submenu trigger focusable but stops it from opening its submenu, as the menu pattern asks. Sets `data-disabled` and `aria-disabled`. */
  disabled?: boolean
}

type ContextTriggerProps = {
  /**
   * Stops a right-click, a long press or Shift+F10 from opening the menu here. The browser's own menu shows instead.
   * @defaultValue false
   */
  disabled?: boolean
  /** Data for the content to render when this area opens the menu, like the row it belongs to. */
  payload?: unknown
}

type CheckboxProps = {
  /** Identifies the item, in the menu's `onCheckedChange`. */
  value: string
  /**
   * The text typeahead matches, when the content isn't plain text. It isn't the accessible name: use `aria-label` for that.
   */
  label?: string
  /** Keeps the item focusable but stops it from toggling, as the menu pattern asks. */
  disabled?: boolean
  /** Whether the item is checked. Pass it to control the item. */
  checked?: boolean
  /**
   * Whether the item starts checked, when uncontrolled.
   * @defaultValue false
   */
  defaultChecked?: boolean
  /** Runs when the item wants to toggle. `details.reason` says why, and `details.cancel()` stops it. */
  onCheckedChange?: (
    checked: boolean,
    details: ChangeDetails<MenuCheckedChangeReason>
  ) => void
  /**
   * Whether toggling closes the menu.
   * @defaultValue false
   */
  closeOnSelect?: boolean
}

type RadioGroupProps<T extends string = string> = {
  /** @internal Generated by each framework, or a data menu's group name. */
  name: string
  /** The selected value. Pass it to control the group. `null` selects nothing. */
  value?: T | null
  /** The value selected at first, when uncontrolled. */
  defaultValue?: T | null
  /** Runs when the selection wants to change. `details.reason` says why, and `details.cancel()` stops it. */
  onValueChange?: (
    value: T,
    details: ChangeDetails<MenuValueChangeReason>
  ) => void
}

type RadioProps = {
  /** @internal Provided by the radio group. */
  group?: string
  /** Selected in the group when the item is chosen. */
  value: string
  /**
   * The text typeahead matches, when the content isn't plain text. It isn't the accessible name: use `aria-label` for that.
   */
  label?: string
  /** Keeps the item focusable but stops it from being chosen, as the menu pattern asks. */
  disabled?: boolean
  /**
   * Whether choosing the item closes the menu.
   * @defaultValue false
   */
  closeOnSelect?: boolean
}

type IndicatorProps = {
  /** @internal The slot of the item the indicator is in. */
  item: "checkbox-item" | "radio-item"
  /** @internal The key of the item the indicator is in. */
  itemKey: string
  /** @internal The radio group of the item, for radio items. */
  group?: string
  /**
   * Whether the indicator stays in the page while its item is unchecked, so it can be styled or animated in both states.
   * @defaultValue false
   */
  keepMounted?: boolean
}

type ContentProps = PositionProps &
  PortalProps & {
    /**
     * Which side of the trigger the menu opens on. Submenus open to the side, mirrored in right-to-left layouts.
     * @defaultValue "bottom"
     */
    side?: PositionProps["side"]
    /**
     * How the menu lines up with the trigger along that side.
     * @defaultValue "start"
     */
    align?: PositionProps["align"]
    /**
     * Gap between the trigger and the menu, in pixels.
     * @defaultValue 4
     */
    sideOffset?: number
    /** Shift along the trigger, in pixels. Submenus default to lining up their first item with the trigger. */
    alignOffset?: number
    /**
     * Where focus goes when the menu closes while focus is inside it. `"trigger"` returns it to the trigger and `"none"` leaves it. A CSS selector, an element or a function picks a specific element.
     * @defaultValue "trigger"
     */
    finalFocus?: MenuFinalFocus
    /**
     * Whether the menu stays in the page, hidden, while closed. Its content keeps its state between opens.
     * @defaultValue false
     */
    keepMounted?: boolean
  }

const itemSelector =
  '[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"]'

function eachShortcut(
  items: MenuData,
  run: (value: string, shortcut: string) => void
) {
  for (const item of items) {
    if (typeof item === "string") {
      continue
    }
    if (
      (item.type ?? "item") === "item" &&
      "shortcut" in item &&
      item.shortcut &&
      !item.disabled
    ) {
      run(item.value, item.shortcut)
    }
    // A disabled submenu's items can't run, by shortcut either.
    if (item.type === "group" || (item.type === "submenu" && !item.disabled)) {
      eachShortcut(item.items, run)
    }
  }
}

function wait(
  store: Store<MenuState>,
  key: string,
  pending: PromiseLike<unknown>,
  done: () => void
) {
  store.set({ pending: [...store.get().pending, key] })
  const settled = () => store.get().pending.filter((other) => other !== key)
  pending.then(
    () => {
      store.set({ pending: settled() })
      done()
    },
    (reason) => store.set({ pending: settled(), error: { key, reason } })
  )
}

// Registers a data menu's item shortcuts in the trigger's layer, so a modal
// above it pauses them, and again whenever the items or `itemShortcuts` change.
function bindItemShortcuts(
  store: Store<MenuState>,
  layer: HTMLElement,
  run: (value: string, event?: Event) => unknown
) {
  let bound: MenuData | undefined
  let offs: (() => void)[] = []
  // Pending and failing like a press on the item. `onAction` hears no event,
  // since the key press happened outside the menu.
  const runShortcut = (value: string) => {
    const key = `shortcut:${value}`
    if (store.get().pending.includes(key)) {
      return
    }
    if (store.get().error?.key === key) {
      store.set({ error: null })
    }
    const result = run(value)
    if (isPromise(result)) {
      wait(store, key, result, () => {})
    }
  }
  const sync = () => {
    const { shortcutItems } = store.get()
    if (shortcutItems === bound) {
      return
    }
    bound = shortcutItems
    offs.forEach((off) => off())
    offs = []
    if (!shortcutItems) {
      return
    }
    eachShortcut(shortcutItems, (value, shortcut) =>
      offs.push(
        shortcutManager.register(shortcut, () => runShortcut(value), { layer })
      )
    )
  }
  sync()
  const unsubscribe = store.subscribe(sync)
  return () => {
    unsubscribe()
    offs.forEach((off) => off())
  }
}

/**
 * `menu`'s api, which its slots and controller call. Adapters
 * expose it as `api`.
 * @stable
 */
interface MenuApi extends ReturnType<typeof menuApiBody> {}

type Show = {
  focus?: Focus
  event?: Event
  by?: PopupOpener
  reason?: MenuPayloadChangeReason
  trigger?: string
} & PopupOpenOptions<unknown, MenuPayloadChangeReason>

type Close = {
  reason?: MenuOpenChangeReason
  event?: Event
  focus?: boolean | "unless-moved"
  returnValue?: string
}

// What adapters pass on top: the parent menu, for submenus, and the menubar a
// root menu sits in.
type MenuInternalOptions = MenuOptions & {
  // Set for submenus. The parent menu's api.
  parent?: MenuNode
  // Set for menus in a menubar.
  menubar?: () => MenubarApi | undefined
}

// What menus in one tree see of each other.
type MenuNode = {
  id: string
  root: () => MenuNode
  isOpen: () => boolean
  presentation: () => Presentation
  popupElement: () => HTMLElement | undefined
  options: () => MenuInternalOptions
  getPayload: () => unknown
  show: (options?: Show) => Promise<PopupResult<MenuOpenChangeReason>>
  hide: (options?: Close) => boolean
  runAction: (value: string, event?: Event) => unknown
  focusTrigger: () => void
  triggerElement: () => HTMLElement | undefined
  modalSetting: () => boolean | "pointer"
  treeContains: (target: Node) => boolean
  internal: {
    findEntry: (el: HTMLElement) => { entry: Entry } | undefined
    entryOf: (el: HTMLElement) => Entry | undefined
    children: Set<MenuNode>
    safeArea: ReturnType<typeof createSafeArea>
    register: (el: HTMLElement, entry: Omit<Entry, "el">) => () => void
    highlight: (
      key: string | null,
      options?: { focus?: boolean; scroll?: boolean }
    ) => void
    childOpenChanged: (childId: string, open: boolean) => void
    hoverItem: (el: HTMLElement, event: PointerEvent) => void
    cancelHoverOpen: () => void
    trackPointer: (event: PointerEvent) => void
    layer: () => Layer | undefined
    barArrow: (by: 1 | -1, event: KeyboardEvent) => boolean
  }
}

function menuApiBody(
  context: PrimitiveContext<MenuInternalOptions, MenuState, string>
) {
  const { id, store, options, element, props } = context
  // A controlled close clears the highlight in the same pass.
  deriveOpen(context, ["highlighted"], (open) =>
    open ? undefined : { highlighted: null }
  )
  const parent = options().parent
  // Items by key, in document order, and by element for events.
  const entries = createOrder<Entry>()
  const byElement = new WeakMap<HTMLElement, Entry>()
  const children = new Set<MenuNode>()
  const typeahead = createTypeahead()
  const safeArea = createSafeArea()
  let pendingFocus: Focus = "none"
  announcePending(
    { ...context, options: () => root().options() },
    () => store.get().pending.length > 0
  )
  let hoverTimer: ReturnType<typeof setTimeout> | undefined
  // Counts closes, so an item's Promise that settles after the menu closed
  // doesn't close it again once it's reopened.
  let session = 0
  // NaN until the pointer first moves, so the first move always counts.
  let pointerX = NaN
  let pointerY = NaN
  // The menubar a root menu sits in. Submenus belong to their root's. The
  // adapter passes it once, as the menu is made, so it's read here and never
  // while parts render, whose attributes read state alone.
  const menubarOf = parent ? undefined : options().menubar
  const bar = () => menubarOf?.()

  // The trigger that opened the menu last, a button or a context area, or the first trigger.
  function activeTrigger() {
    const key = store.get().trigger
    if (key === null) {
      return {
        el: element("trigger") ?? element("context-trigger"),
        context: false,
      }
    }
    const button = element("trigger", key)
    if (button) {
      return { el: button, context: false }
    }
    return { el: element("context-trigger", key), context: true }
  }
  const triggerElement = () => activeTrigger().el
  // Whether a press lands on one of the menu's enabled button triggers.
  const pressesTrigger = (target: Node) =>
    elements(context, "trigger").some(
      ({ el, props }) =>
        el.contains(target) && !triggerDisabled(store.get(), props)
    )

  const kit = createPopup(
    context as unknown as PrimitiveContext<
      MenuInternalOptions,
      PopupState,
      string
    >,
    {
      preset: menuPreset,
      // The root closes the whole tree when the window loses focus.
      behavior: { blur: parent ? "never" : "always" },
      rules: () => ({
        trigger: triggerElement,
        dismiss(reason, { event, focus, returnValue }) {
          // Tab: focus moves on from the root trigger, and the whole tree closes.
          if (reason === "focus-out") {
            root().focusTrigger()
            return root().hide({ reason, event, focus: false })
          }
          // An outside press leaves focus wherever the press put it.
          hide({
            reason: reason as MenuOpenChangeReason,
            event,
            focus: reason === "outside-press" ? false : focus === true,
            returnValue,
          })
        },
        // A context area counts as inside only for the secondary button, which
        // moves the open menu instead of closing it.
        contains(target, event) {
          // Submenus close first, so focus in one rendered elsewhere still returns with this menu's.
          if ([...children].some((child) => child.treeContains(target))) {
            return true
          }
          // A press on another trigger of the menubar switches menus instead.
          if (bar()?.internal.onTrigger(target)) {
            return true
          }
          // So does a press on another trigger of this menu, which takes it over
          // instead of closing and reopening it. Focus moving there still leaves it.
          if (event && pressesTrigger(target)) {
            return true
          }
          const { el, context } = activeTrigger()
          if (!el?.contains(target)) {
            return false
          }
          return !context || (event as MouseEvent | undefined)?.button === 2
        },
        // Submenus share their root's modality, and only the root hides the page.
        modal: () => ({
          ...modalTriple(root().modalSetting()),
          ...(parent && { inertAndLock: false }),
        }),
        // A modal menu in a menubar leaves the menubar usable, so another menu can take over.
        persistent: () => {
          const barElement = bar()?.internal.element()
          return barElement && root().modalSetting() === true
            ? [barElement]
            : []
        },
        parent: parent && (() => parent.internal.layer()),
        // Submenus present like their root. A context menu and a menubar's menus stay popovers.
        presentation: () =>
          parent
            ? parent.presentation()
            : bar() || activeTrigger().context
              ? "popover"
              : options().presentation,
        onOpenChange(open) {
          parent?.internal.childOpenChanged(id, open)
          bar()?.internal.openChanged(id, open)
          if (open) {
            return
          }
          session++
          clearTimeout(hoverTimer)
          safeArea.stop()
          children.forEach((child) =>
            child.hide({ reason: "parent-close", focus: false })
          )
          store.set({ highlighted: null })
        },
        // A submenu closes one level and focuses the item that opened it.
        onEscape: parent
          ? (event) => {
              hide({ reason: "escape-key", event, focus: false })
              focusTriggerItem()
            }
          : undefined,
        // A sibling, or another menu of the menubar, that refuses to close stays the open one.
        open(request, open) {
          const { event } = request
          const siblings = parent ? [...parent.internal.children] : []
          if (
            !siblings.every(
              (sibling) => sibling === api || closes(sibling, "submenu-switch")
            )
          ) {
            return
          }
          if (bar()?.internal.opening(id, event) === false) {
            return
          }
          pendingFocus = (request.focus as Focus | undefined) ?? "first"
          openedByHover = request.reason === "trigger-hover"
          open(request.by ?? openerOf(event))
        },
        // Another trigger takes the menu over where it's pressed, so an open
        // again only moves focus.
        reopen(request) {
          pendingFocus = (request.focus as Focus | undefined) ?? "first"
          runPendingFocus()?.focus({ preventScroll: true })
        },
        // Submenus close first, so one that refuses keeps its parent open. One
        // closing with its parent moves focus to its trigger item: a portalled
        // submenu isn't inside the parent, which then wouldn't return focus.
        close({ reason, event }, close) {
          const child = openChild()
          if (
            child &&
            !withSource(changeSource(reason, event), () =>
              closes(child, "parent-close")
            )
          ) {
            return
          }
          const el = popup.element()
          const active = el && activeElement(el.ownerDocument)
          const held =
            reason === "parent-close" &&
            !!active &&
            composedContains(el, active)
          if (close() && held) {
            focusTriggerItem()
          }
        },
      }),
    }
  )
  const popup = kit.internal.popup
  const presentation = kit.internal.presentation
  // The control runs on plain strings. The menu calls it with its own reasons and open options.
  const control = kit.internal.control as unknown as ReturnType<
    typeof createOpenSteps<
      MenuOpenChangeReason,
      string,
      MenuOpenOptions,
      MenuPayloadChangeReason
    >
  >
  const { show, hide } = control

  // check-code: allow return-type recursive, so TypeScript cannot infer it.
  function root(): MenuNode {
    return parent ? parent.root() : api
  }

  // An item in the page, by key.
  function entryFor(key: string | null) {
    const entry = key === null ? undefined : entries.get(key)
    return entry?.el.isConnected ? entry : undefined
  }

  const entryOf = (el: HTMLElement) => byElement.get(el)

  function highlight(
    key: string | null,
    { focus = true, scroll = false } = {}
  ) {
    const found = entryFor(key)
    const child = openChild()
    if (
      child &&
      found?.el !== child.triggerElement() &&
      key !== null &&
      !closes(child, "submenu-switch")
    ) {
      return
    }
    store.set({ highlighted: key })
    if (!focus) {
      return
    }
    if (found) {
      found.el.focus({ preventScroll: true })
      if (scroll) {
        found.el.scrollIntoView({ block: "nearest" })
      }
    } else {
      popup.element()?.focus({ preventScroll: true })
    }
  }

  function openChild() {
    return [...children].find((child) => child.isOpen())
  }

  function closes(menu: MenuNode, reason: MenuOpenChangeReason, event?: Event) {
    return !menu.isOpen() || menu.hide({ reason, event, focus: false })
  }

  function focusTrigger() {
    triggerElement()?.focus({ preventScroll: true })
  }

  // Writes data-highlighted without a render.
  let lastHighlighted: HTMLElement | undefined
  store.subscribe(() => {
    const next = entryFor(store.get().highlighted)?.el
    if (next === lastHighlighted) {
      return
    }
    lastHighlighted?.removeAttribute("data-highlighted")
    next?.setAttribute("data-highlighted", "")
    lastHighlighted = next
  })

  // For submenus: focus this menu's trigger item in the parent.
  function focusTriggerItem() {
    const trigger = element("trigger")
    const key = trigger && parent?.internal.entryOf(trigger)?.key
    if (key !== undefined && parent) {
      parent.internal.highlight(key)
    }
  }

  function checkboxValue(itemProps: CheckboxProps) {
    return (
      itemProps.checked ??
      (store.get().values[itemProps.value] as boolean | undefined) ??
      itemProps.defaultChecked ??
      false
    )
  }

  function radioValue(group: string) {
    const groupProps = props("radio-group", group) as
      RadioGroupProps | undefined
    if (groupProps?.value !== undefined) {
      return groupProps.value
    }
    const own = store.get().values[`radio:${group}`] as string | undefined
    return own ?? groupProps?.defaultValue ?? null
  }

  // Toggles a checkbox item. Its own callback hears first, then the root menu's,
  // and either can cancel.
  function setCheckbox(
    itemProps: CheckboxProps,
    event?: Event,
    reason: MenuCheckedChangeReason = "item-press"
  ) {
    const next = !checkboxValue(itemProps)
    const details = createDetails(
      { reason, event },
      changeSource(reason, event)
    )
    itemProps.onCheckedChange?.(next, details)
    if (details.canceled) {
      return false
    }
    const shared = createDetails(
      { reason, event, value: itemProps.value },
      changeSource(reason, event)
    )
    root().options().onCheckedChange?.(next, shared)
    if (shared.canceled) {
      return false
    }
    if (itemProps.checked === undefined) {
      store.set({ values: { ...store.get().values, [itemProps.value]: next } })
    }
    return true
  }

  // Selects a radio item in its group, the same way.
  function setRadio(
    group: string,
    value: string,
    event?: Event,
    reason: MenuValueChangeReason = "item-press"
  ) {
    const groupProps = props("radio-group", group) as
      RadioGroupProps | undefined
    if (radioValue(group) === value) {
      return false
    }
    const details = createDetails(
      { reason, event },
      changeSource(reason, event)
    )
    groupProps?.onValueChange?.(value, details)
    if (details.canceled) {
      return false
    }
    const shared = createDetails(
      { reason, event, group },
      changeSource(reason, event)
    )
    root().options().onValueChange?.(value, shared)
    if (shared.canceled) {
      return false
    }
    if (groupProps?.value === undefined) {
      store.set({
        values: { ...store.get().values, [`radio:${group}`]: value },
      })
    }
    return true
  }

  const api = {
    ...control.api,
    id,
    options,
    getPayload: () => store.get().payload,
    focus: () => focusTrigger(),
    show,
    hide,
    parentMenu: () => parent,
    popupElement: () => popup.element(),
    itemProps: <Props extends object>(slot: string, key: string) =>
      props<Props>(slot, key),
    triggerElement,
    focusTriggerItem,
    checkboxValue,
    radioValue,
    setCheckbox,
    setRadio,
    root,
    treeContains,
    isMounted: () => store.get().mounted,
    // A sheet is modal unless the app says otherwise.
    modalSetting: () =>
      sheetModal(
        store.get().presentation,
        options().modal ?? bar()?.internal.modal(),
        "pointer"
      ),
    menubar: bar,
    presentation: () => store.get().presentation,
    anchor: (el?: HTMLElement, setting?: Anchor | string | null) =>
      control.anchor() ??
      (el ? contentAnchor(el, setting, triggerElement) : triggerElement()),
    // Runs a plain item and closes the whole tree. Focus returns to the root
    // trigger, unless the item opened something that took it, like a dialog.
    action(value: string | undefined, event?: Event) {
      const top = root()
      if (value !== undefined) {
        top.runAction(value, event)
      }
      top.hide({ reason: "item-press", event, focus: "unless-moved" })
    },
    runAction: (value: string, event?: Event) =>
      options().onAction?.(value, { event }),
    wait(key: string, pending: PromiseLike<unknown>, done: () => void) {
      const started = session
      wait(store, key, pending, () => started === session && done())
    },
    isPending: (key: string) => store.get().pending.includes(key),
    clearError(key: string) {
      if (store.get().error?.key === key) {
        store.set({ error: null })
      }
    },
    focusTrigger,
    // Internal. Used by submenus and slots.
    internal: {
      findEntry,
      entryOf,
      children,
      safeArea,
      register(el: HTMLElement, item: Omit<Entry, "el">) {
        const entry = { ...item, el }
        const remove = entries.add(entry)
        byElement.set(el, entry)
        return () => {
          remove()
          if (byElement.get(el) === entry) {
            byElement.delete(el)
          }
        }
      },
      highlight,
      childOpenChanged(childId: string, open: boolean) {
        if (open) {
          store.set({ openChild: childId })
        } else if (store.get().openChild === childId) {
          store.set({ openChild: null })
        }
      },
      hoverItem(el: HTMLElement, event: PointerEvent) {
        if (event.pointerType === "touch") {
          return
        }
        // WebKit fires pointermove without movement when content scrolls under the pointer.
        const moved = pointerX !== event.clientX || pointerY !== event.clientY
        pointerX = event.clientX
        pointerY = event.clientY
        if (!moved && store.get().highlighted !== null) {
          return
        }
        hover(el, event)
      },
      cancelHoverOpen: () => clearTimeout(hoverTimer),
      trackPointer(event: PointerEvent) {
        if (event.pointerType === "touch") {
          return
        }
        pointerX = event.clientX
        pointerY = event.clientY
      },
      popup,
      presentation,
      layer: () => popup.layer(),
      barArrow,
      barKeydown,
      runPendingFocus,
      onKeyDown,
      pointerPress,
      takeOver: control.takeOver,
      contextOpen,
      consumePressClick() {
        const pressed = pressClick
        pressClick = false
        return pressed
      },
    },
  }

  function hover(el: HTMLElement, event: PointerEvent) {
    const entry = entryOf(el)
    if (!entry) {
      return
    }
    const child = openChild()
    if (child && child.triggerElement() !== el) {
      // Heading for the open submenu. Leave it open, and once the pointer
      // rests, apply where it rests, though it hasn't moved since.
      if (
        safeArea.contains({ x: event.clientX, y: event.clientY }, () =>
          hover(el, event)
        )
      ) {
        return
      }
      safeArea.stop()
      if (!closes(child, "submenu-switch", event)) {
        return
      }
    }
    if (
      store.get().highlighted !== entry.key ||
      document.activeElement !== el
    ) {
      highlight(entry.key)
    }
    clearTimeout(hoverTimer)
    // In a sheet, a submenu replaces the items, so only a press opens it.
    if (
      entry.openSubmenu &&
      !entry.disabled() &&
      store.get().presentation !== "sheet"
    ) {
      hoverTimer = setTimeout(
        () =>
          !entry.disabled() &&
          entry.openSubmenu!("none", "trigger-hover", event),
        options().delay ?? 100
      )
    }
  }

  let pressClick = false
  // Opened by resting the pointer on the trigger, so the press that usually
  // follows keeps it open instead of closing it.
  let openedByHover = false

  // Left and Right inside a menubar's menu, on an item without a submenu. The
  // menubar decides, so a menu outside one carries none of this.
  function barArrow(by: 1 | -1, event: KeyboardEvent) {
    const result = bar()?.internal.menuArrow(id, by, event)
    if (result === "close") {
      hide({ reason: "escape-key", event })
    }
    return !!result
  }

  // Keys on a trigger in a menubar. The menubar moves between triggers, and
  // says when a key opens this menu, and at which end.
  function barKeydown(
    event: KeyboardEvent,
    el: HTMLElement,
    key: string,
    props: TriggerProps
  ) {
    const focus = bar()!.internal.triggerKeydown(
      event,
      id,
      el,
      triggerDisabled(store.get(), props)
    )
    if (focus) {
      show({ focus, event, trigger: key, payload: props.payload })
    }
  }

  // Opens on press. Releasing over an item after dragging selects it, like
  // native menus. A quick click never selects, even if the menu covers the trigger.
  function pointerPress(
    trigger: HTMLElement,
    event: PointerEvent,
    key: string,
    payload: unknown
  ) {
    pressClick = true
    const { open, trigger: active } = store.get()
    // Another trigger takes the open menu over. A drag from it selects, as from a press that opens.
    const opening = !open || (active !== null && active !== key)
    if (!open) {
      show({ focus: "popup", event, trigger: key, payload })
    } else if (opening) {
      control.takeOver({
        trigger: key,
        payload,
        reason: "trigger-press",
        event,
      })
    } else if (!openedByHover) {
      hide({ reason: "trigger-press", event })
    }
    openedByHover = false
    const start = { x: event.clientX, y: event.clientY }
    const off = on(window, "pointerup", (up) => {
      off()
      // The window sees only the shadow host around a trigger in a shadow root.
      const target = up.composedPath()[0] as HTMLElement
      // A release off the trigger sends it no click, so the next click, like Enter, is a new press.
      if (!composedContains(trigger, target)) {
        pressClick = false
      }
      if (!opening) {
        return
      }
      // Timed by when the input happened, so a busy page rendering the menu
      // doesn't turn a click into a hold.
      const held = up.timeStamp - event.timeStamp >= 200
      const moved = Math.hypot(up.clientX - start.x, up.clientY - start.y) > 4
      if (!held || (!moved && composedContains(trigger, target))) {
        return
      }
      const item = composedClosest<HTMLElement>(target, itemSelector)
      const entry = item && findEntry(item)
      if (entry && !entry.entry.disabled() && !entry.entry.openSubmenu) {
        entry.entry.activate(up)
      } else if (
        !item &&
        !composedContains(trigger, target) &&
        !root().treeContains(target)
      ) {
        hide({ reason: "trigger-release", event: up, focus: false })
      }
    })
  }

  // Opens at a point, or moves the open menu there: a right-click, a long
  // press, or Shift+F10 on something inside a context area.
  function contextOpen(
    at: Anchor,
    {
      event,
      by,
      key,
      payload,
    }: { event?: Event; by: PopupOpener; key: string; payload: unknown }
  ) {
    if (store.get().open) {
      control.takeOver({
        trigger: key,
        payload,
        anchor: at,
        reason: "trigger-press",
        event,
      })
      if (by === "keyboard") {
        show({ focus: "first", event })
      }
      return
    }
    show({
      focus: by === "keyboard" ? "first" : "popup",
      event,
      by,
      anchor: at,
      trigger: key,
      payload,
    })
  }

  // Finds an item's entry in this menu or any open submenu.
  function findEntry(el: HTMLElement) {
    const entry = entryOf(el)
    if (entry) {
      return { entry }
    }
    for (const child of children) {
      const found = child.internal.findEntry(el)
      if (found) {
        return found
      }
    }
  }

  function treeContains(target: Node) {
    // A submenu that just closed, before its parent, still holds focus until the page updates.
    const el = popup.element() ?? element("content")
    if (el && composedContains(el, target)) {
      return true
    }
    return [...children].some((child) => child.treeContains(target))
  }

  // Moves focus to the item asked for, or returns the popup for the layer to focus.
  function runPendingFocus() {
    const focus = pendingFocus
    pendingFocus = "none"
    const list = entries.list()
    if (focus === "first" && list.length) {
      highlight(list[0].key, { scroll: true })
    } else if (focus === "last" && list.length) {
      highlight(list.at(-1)!.key, { scroll: true })
    } else if (focus === "popup") {
      return popup.element()
    }
  }

  function onKeyDown(event: KeyboardEvent) {
    const target = event.target as HTMLElement
    // Keys from a submenu bubble through its parent's popup. Only the owner handles them.
    if (target.closest('[role="menu"]') !== popup.element()) {
      return
    }
    const list = entries.list()
    const focused = entryOf(document.activeElement as HTMLElement)
    const currentKey = focused?.key ?? store.get().highlighted
    const index = list.findIndex((entry) => entry.key === currentKey)
    const current = list[index]
    const loop = options().loop ?? true
    const move = (next: number) => {
      event.preventDefault()
      if (!list.length) {
        return
      }
      const clamped = loop
        ? (next + list.length) % list.length
        : Math.max(0, Math.min(list.length - 1, next))
      highlight(list[clamped].key, { scroll: true })
    }

    // In right-to-left layouts, submenus open to the left, so the arrows swap.
    const rtl = isRTL(popup.element())
    const key =
      rtl && event.key === "ArrowRight"
        ? "ArrowLeft"
        : rtl && event.key === "ArrowLeft"
          ? "ArrowRight"
          : event.key

    switch (key) {
      case "ArrowDown":
        return move(index === -1 ? 0 : index + 1)
      case "ArrowUp":
        return move(index === -1 ? list.length - 1 : index - 1)
      case "Home":
      case "PageUp":
        return move(0)
      case "End":
      case "PageDown":
        return move(list.length - 1)
      case "ArrowRight":
        if (current?.openSubmenu && !current.disabled()) {
          event.preventDefault()
          current.openSubmenu("first", "trigger-press", event)
        } else if (root().internal.barArrow(1, event)) {
          event.preventDefault()
        }
        return
      case "ArrowLeft":
        // A submenu's close key, like Escape.
        if (parent) {
          event.preventDefault()
          hide({ reason: "escape-key", event, focus: false })
          focusTriggerItem()
        } else if (barArrow(-1, event)) {
          event.preventDefault()
        }
        return
      case "Escape": {
        event.preventDefault()
        // A submenu the pointer opened leaves focus on its trigger here, and it
        // closes first, as it does with focus inside it.
        const child = openChild()
        if (child) {
          child.hide({ reason: "escape-key", event, focus: false })
          return
        }
        if (parent) {
          hide({ reason: "escape-key", event, focus: false })
          focusTriggerItem()
        } else {
          hide({ reason: "escape-key", event })
        }
        return
      }
      case "Tab":
        // Lets the browser move focus on from the trigger, then closes everything.
        return popup.keydown(event)
      case "Enter":
      case " ": {
        // Space continues a search only when it still matches something.
        if (event.key === " " && typeahead.active()) {
          const found = typeahead(
            " ",
            list.map((entry) => entry.label()),
            index
          )
          if (found !== -1) {
            event.preventDefault()
            highlight(list[found].key, { scroll: true })
            return
          }
          typeahead.reset()
        }
        if (
          !current ||
          current.disabled() ||
          current.openSubmenu ||
          current.el.matches("a[href]")
        ) {
          event.preventDefault()
          if (!current || current.disabled()) {
            return
          }
          const el = current.el
          if (current.openSubmenu) {
            current.openSubmenu("first", "trigger-press", event)
          }
          // Links follow themselves, so routers, targets and modifier handling all
          // work. The click activates the item like a pointer press, and reports the key.
          else {
            withSource(sourceOf(event), () => el.click())
          }
          return
        }
        // Activates before preventing the key's default, so `event.preventDefault()`
        // in `onSelect` can still keep the menu open.
        current.activate(event)
        event.preventDefault()
        return
      }
    }

    if (
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      const found = typeahead(
        event.key,
        list.map((entry) => entry.label()),
        index
      )
      if (found !== -1) {
        event.preventDefault()
        highlight(list[found].key, { scroll: true })
      }
    }
  }

  return api
}

const menuApi: (...args: Parameters<typeof menuApiBody>) => MenuApi =
  menuApiBody

type MenuState = {
  open: boolean
  // True while the popup is in the DOM, including while it animates out.
  mounted: boolean
  highlighted: string | null
  values: Record<string, unknown>
  presentation: Presentation
  // Id of the open submenu. The tree's open path, one level per menu.
  openChild: string | null
  // Apple keyboard conventions for shortcuts. Neutral until the client binds,
  // so server and first client render agree.
  apple: boolean
  // The trigger or context area that opened the menu last, by key. Null until one binds.
  trigger: string | null
  payload: unknown
  // In a menubar: whether the trigger holds its tab stop, null until it binds,
  // and whether the whole menubar is disabled.
  barStop: boolean | null
  barDisabled: boolean
  // The groups and radio groups whose label is in the page, so only those are named by it.
  groupLabels: readonly string[]
  // The button triggers in the page, so the content is named only by one that exists.
  triggers: readonly string[]
  // What each trigger that isn't a native button is rendered as, by key.
  triggerElements: Record<string, ButtonElement>
  // A data menu's items while `itemShortcuts` is on, so triggers register their shortcuts again when they change.
  shortcutItems: MenuData | undefined
  // Items whose `onSelect` or `onAction` Promise hasn't settled, and the last one that failed.
  pending: string[]
  error: { key: string; reason: unknown } | null
}

const triggerDisabled = (state: MenuState, props: TriggerProps) =>
  !!props.disabled || state.barDisabled

export {
  type MenuInternalOptions,
  bindItemShortcuts,
  type CheckboxProps,
  type ContentProps,
  type ContextTriggerProps,
  type Entry,
  type Focus,
  type IndicatorProps,
  type ItemProps,
  itemSelector,
  type MenuApi,
  menuApi,
  type MenuNode,
  type MenuState,
  type Presentation,
  type RadioGroupProps,
  type RadioProps,
  type SubTriggerProps,
  triggerDisabled,
  type TriggerProps,
}
