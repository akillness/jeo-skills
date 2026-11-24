// Where keys move focus in a navigation menu: the APG's optional arrows, into
// a panel an arrow key opened, and Tab around a panel that renders elsewhere.
// Otherwise Tab stays the browser's, except where the popup layer takes it.
import { documentOrder, isAfter } from "../../foundation/kernel/order"
import { isRTL } from "../../foundation/platform/env"
import { nextTabbable, tabbables } from "../../foundation/focus/tabbable"
import { ownsEvent } from "../../foundation/popups/popup-elements"
import {
  isModified,
  listKey,
  panelKey,
  stepIndex,
} from "./navigation-menu-keyboard"

// Fields in a panel, like a search box, keep the keys that move their caret or
// value. The browser decides what's editable, since contenteditable inherits.
const fields =
  'input:not([type="checkbox"], [type="button"], [type="submit"], [type="reset"], [type="image"]), textarea, select'

function createFocus(config: {
  orientation: () => "horizontal" | "vertical"
  value: () => string | null
  list: () => HTMLElement | undefined
  triggers: () => {
    el: HTMLElement
    key: string
    props?: { disabled?: boolean }
  }[]
  links: () => HTMLElement[]
  trigger: (key: string) => HTMLElement | undefined
  content: (key: string) => HTMLElement | undefined
  // The element showing the open panel: the viewport, or the content itself.
  panel: () => HTMLElement | undefined
  // Opens an item from the keyboard.
  open: (key: string, event: KeyboardEvent) => void
}) {
  // An arrow key opened this item, and focus moves into its panel once it binds.
  let pending: string | null = null

  // Focuses the first link in an item's panel, now if it's shown, or once its content binds.
  function enterPanel(key: string) {
    const content = config.content(key)
    if (content && config.value() === key && !content.hidden) {
      pending = null
      tabbables(content)[0]?.focus()
    } else {
      pending = key
    }
  }

  // Top-level triggers and links in this menu's list, in document order:
  // inside the list, and not inside a content in it. Contents kept closed in
  // place hold links too, and a nested menu's list holds its own.
  function topLevel() {
    const list = config.list()
    if (!list) {
      return []
    }
    return [...config.triggers().map((entry) => entry.el), ...config.links()]
      .filter((el) => {
        const panel = el.closest('[data-slot="navigation-menu-content"]')
        return (
          list.contains(el) &&
          !(panel && list.contains(panel)) &&
          !el.matches(":disabled")
        )
      })
      .sort(documentOrder)
  }

  return {
    topLevel,

    listKeydown(event: KeyboardEvent, list: HTMLElement) {
      const target = event.target as HTMLElement
      if (isModified(event) || !ownsEvent(list, event)) {
        return
      }
      const items = topLevel().filter(
        (item) =>
          !item.closest("[inert]") &&
          (item.checkVisibility?.({ visibilityProperty: true }) ??
            !item.closest("[hidden]"))
      )
      const index = items.findIndex(
        (item) => item === target || item.contains(target)
      )
      if (index === -1) {
        return
      }
      const step = listKey(event.key, config.orientation(), isRTL(list))
      if (step === undefined) {
        return
      }
      if (step !== "enter") {
        event.preventDefault()
        items[stepIndex(index, step, items.length)]?.focus()
        return
      }
      const trigger = config
        .triggers()
        .find((entry) => entry.el === items[index])
      if (!trigger || trigger.props?.disabled) {
        return
      }
      event.preventDefault()
      config.open(trigger.key, event)
      enterPanel(trigger.key)
    },

    panelKeydown(event: KeyboardEvent, panel: HTMLElement) {
      const target = event.target as HTMLElement
      // Keys from a nested menu's panel are its own.
      // A field in a shadow root retargets the event to its host, so the path's first element is the field.
      const origin = target.shadowRoot ? event.composedPath()[0] : target
      const field = origin instanceof HTMLElement ? origin : target
      const inField = field.isContentEditable || field.matches(fields)
      if (isModified(event) || !ownsEvent(panel, event) || inField) {
        return
      }
      const step = panelKey(event.key, isRTL(panel))
      if (step === undefined) {
        return
      }
      const links = tabbables(panel)
      const index = links.findIndex(
        (link) => link === target || link.contains(target)
      )
      if (index === -1) {
        return
      }
      event.preventDefault()
      links[stepIndex(index, step, links.length)]?.focus()
    },

    // Shift+Tab from the item after an open panel goes back into the panel,
    // as it would if the panel sat right after its trigger in the page. Tab
    // past the last item skips the panel it already went through.
    rootKeydown(event: KeyboardEvent) {
      const value = config.value()
      if (event.key !== "Tab" || value === null) {
        return
      }
      const panel = config.panel()
      const trigger = config.trigger(value)
      const target = event.target as HTMLElement
      if (!panel || !trigger || panel.contains(target)) {
        return
      }
      if (!event.shiftKey) {
        const next = nextTabbable(target)
        const after = nextTabbable(panel, panel)
        if (next && panel.contains(next) && isAfter(trigger, target) && after) {
          event.preventDefault()
          after.focus()
        }
        return
      }
      // Already between the trigger and here, the browser gets there on its own.
      if (isAfter(trigger, panel) && isAfter(panel, target)) {
        return
      }
      if (nextTabbable(trigger, panel) !== target) {
        return
      }
      const last = tabbables(panel).at(-1)
      if (!last) {
        return
      }
      event.preventDefault()
      last.focus()
    },

    // A content bound: focus moves in if an arrow key opened its item.
    contentBound(key: string, el: HTMLElement) {
      if (pending !== key || config.value() !== key) {
        return
      }
      pending = null
      queueMicrotask(() => tabbables(el)[0]?.focus())
    },
  }
}

export { createFocus }
