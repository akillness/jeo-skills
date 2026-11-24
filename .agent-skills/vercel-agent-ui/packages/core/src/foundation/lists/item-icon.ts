// The icon part every component with items shares: MenuItemIcon,
// SelectItemIcon, TabsTabIcon, ToggleIcon and the rest. The icon is hidden
// from assistive technology, so an SVG `<title>`, an icon font's glyph or an
// emoji never joins the item's name, and the text typeahead, labels, filtering
// and highlighting read skips it (`textOf`). It marks its item with
// `data-has-icon` and the list around it with `data-has-icons`, so styles can
// line up items without one, and it can flip in right-to-left text.
import { dev } from "#dev"
import { checkName } from "#name-check"
import type { BaseSlotProps, SlotDefinition } from "../kernel/primitive-types"
import type { Store } from "../kernel/store"
import { writeStyle } from "../platform/style"

/** Props of an item's icon part, in every framework. */
type ItemIconProps = {
  /**
   * Flips the icon horizontally in right-to-left text, for icons that point a
   * way, like arrows and chevrons. Icons that picture a thing, like a
   * clock or a check, stay as they are.
   * @defaultValue false
   */
  mirror?: boolean
}

/** What an icon part's render function receives. */
type ItemIconState = {
  /** Whether it flips in right-to-left text. */
  mirror: boolean
}

type IconProps = ItemIconProps &
  BaseSlotProps & {
    /** @internal The key of the item the icon is in, for a list whose value shows it. */
    item?: string
  }

// The element an icon decorates and the list that element is in, as CSS
// selectors, like `[role="option"]` in `[role="listbox"]`.
type IconPlacement = { item: string; list?: string }

// How many bound icons mark each element with each attribute, so an
// attribute goes when the last icon does.
const marks = /* @__PURE__ */ new WeakMap<Element, Record<string, number>>()

// Sets `data-has-icon` on an item, or `data-has-icons` on a list, while an
// icon part inside is bound.
function mark(el: Element, attribute: "data-has-icon" | "data-has-icons") {
  let counts = marks.get(el)
  if (!counts) {
    marks.set(el, (counts = {}))
  }
  counts[attribute] = (counts[attribute] ?? 0) + 1
  if (counts[attribute] === 1) {
    el.setAttribute(attribute, "")
  }
  return () => {
    counts[attribute]--
    if (counts[attribute] === 0) {
      el.removeAttribute(attribute)
    }
  }
}

// Mirrored icons flip in right-to-left text. One rule per document, in the
// lowest cascade layer, so any class wins. `:dir()` follows the `dir`
// attribute, so a direction that changes later flips them too. `scale` leaves
// a class's `transform`, `rotate` and `translate` alone, and only applies to a
// box, so a mirrored icon is an inline block unless a class says otherwise.
function addMirrorRule(doc: Document) {
  writeStyle(
    doc,
    "ui-sdk-mirror",
    "@layer ui-sdk{:where([data-mirror][aria-hidden]){display:inline-block}:where([data-mirror][aria-hidden]:dir(rtl)){scale:-1 1}}"
  )
}

// Marks the icon's item and list, and calls `found` with the item. Frameworks
// and custom elements can bind an icon before its item or list is in place or
// has its role, like a closed menu's content, which takes its role when it
// opens. So it looks again a microtask later, then after each change until it
// finds both.
function placeIcon(
  el: HTMLElement,
  placement: IconPlacement,
  subscribe: (listener: () => void) => () => void,
  found: (item: HTMLElement) => void
) {
  let unmarkItem: (() => void) | undefined
  let unmarkList: (() => void) | undefined
  let unsubscribe: (() => void) | undefined
  let active = true
  const place = () => {
    const item = el.parentElement?.closest<HTMLElement>(placement.item)
    if (!item) {
      return false
    }
    if (!unmarkItem) {
      unmarkItem = mark(item, "data-has-icon")
      found(item)
    }
    if (!placement.list) {
      return true
    }
    const list = item.parentElement?.closest(placement.list)
    if (list) {
      unmarkList = mark(list, "data-has-icons")
    }
    return !!list
  }
  const placeOnChange = () => {
    if (!place()) {
      return
    }
    unsubscribe?.()
    unsubscribe = undefined
  }
  if (!place()) {
    queueMicrotask(() => {
      if (active && !place()) {
        unsubscribe = subscribe(placeOnChange)
      }
    })
  }
  return () => {
    active = false
    unsubscribe?.()
    unmarkItem?.()
    unmarkList?.()
  }
}

/**
 * An icon inside an item, like a menu item, an option, a tab or a toggle.
 * `register` hears about each icon's element, for a value that shows the
 * selected item's icon.
 */
function itemIconPart<State extends object, Api>(
  placement: IconPlacement & {
    component: string
    register?: (
      el: HTMLElement,
      context: { api: Api; props: IconProps }
    ) => () => void
  }
) {
  return {
    // An icon's id is made for it, and its item is the one it's inside.
    props: {
      mirror: "boolean",
      id: "id",
      item: { kind: "string", from: "item.value" },
    },
    state: (state, { props }) => ({ mirror: !!props.mirror }),
    attrs: (state, { props }) => ({
      "aria-hidden": "true",
      "data-mirror": props.mirror ? "" : undefined,
    }),
    bind(el, { api, props, id, store }) {
      addMirrorRule(el.ownerDocument)
      // An icon alone names nothing. Checked a microtask after its item is
      // found, once the item's text and attributes have rendered.
      const found = (item: HTMLElement) =>
        dev &&
        queueMicrotask(() => {
          if (item.isConnected) {
            checkName(item, "An item with only an icon", {
              component: placement.component,
              id,
            })
          }
        })
      const unplace = placeIcon(el, placement, store.subscribe, found)
      const unregister = placement.register?.(el, { api, props })
      return () => {
        unplace()
        unregister?.()
      }
    },
  } satisfies SlotDefinition<State, Api, IconProps, ItemIconState>
}

// The icons of a list's items by key, for a value that shows the selected
// item's icon. An icon is remembered after its item leaves the page, as a
// copy, like a label, so a closed list's value keeps showing it.
function createItemIcons(store: Store<{ icons: number }>) {
  const icons = new Map<string, Element>()
  let queued = false
  // Batched, since a long list registers all at once.
  const changed = () => {
    if (queued) {
      return
    }
    queued = true
    queueMicrotask(() => {
      queued = false
      store.set({ icons: store.get().icons + 1 })
    })
  }
  return {
    /** The icon element of an item. */
    get: (key: string) => icons.get(key),
    /** Remembers an item's icon until another replaces it. `keep` copies it when it leaves. */
    register(key: string, icon: Element, keep?: (icon: Element) => Element) {
      icons.set(key, icon)
      changed()
      return () => {
        if (icons.get(key) === icon && keep) {
          icons.set(key, keep(icon))
        }
      }
    },
  }
}

type ItemIcons = ReturnType<typeof createItemIcons>

/**
 * Item icons as a feature: the icon inside an item, the selected item's icon
 * outside the list, and the icons by key the second copies from, created when
 * the feature is first used.
 */
function itemIconsFeature<
  State extends { icons: number },
  Api extends ValueIconApi & IconsFeatureApi,
>(
  placement: IconPlacement & {
    component: string
    register?: (
      el: HTMLElement,
      context: { api: Api; props: IconProps }
    ) => () => void
  }
) {
  return {
    slots: {
      "item-icon": itemIconPart<State, Api>(placement),
      "value-icon": valueIconPart<State, Api>(),
    },
    extend(api: Api) {
      api.internal.hooks.icons = createItemIcons(api.internal.store)
    },
  }
}

// What the item icons feature needs from a component.
type IconsFeatureApi = {
  internal: { hooks: { icons?: ItemIcons }; store: Store<{ icons: number }> }
}

// What an icon leaves behind when its item unmounts: a copy, since the
// element itself is about to leave the page and may be emptied.
const keepCopy = (icon: Element) => icon.cloneNode(true) as Element

// Where an option's icon is: in an option of a listbox.
const optionIcon = { item: '[role="option"]', list: '[role="listbox"]' }

// Remembers an option's icon by its item's key, for a value that shows it.
function rememberIcon(
  el: HTMLElement,
  { api, props }: { api: ValueIconApi; props: IconProps }
) {
  return props.item === undefined
    ? () => {}
    : api.internal.icons.register(props.item, el, keepCopy)
}

// What the selected item's icon needs from its component.
type ValueIconApi = {
  internal: { icons: ItemIcons; selection: { keys: () => string[] } }
}

// The selected item's icon, while exactly one item is selected and it has one.
function selectedIcon(api: ValueIconApi) {
  const keys = api.internal.selection.keys()
  return keys.length === 1 ? api.internal.icons.get(keys[0]) : undefined
}

// Copies an icon's content into another element, replacing what was there,
// and whether it flips in right-to-left text.
function copyIcon(icon: Element | undefined, into: HTMLElement) {
  into.replaceChildren(
    ...Array.from(icon?.childNodes ?? [], (node) => node.cloneNode(true))
  )
  into.toggleAttribute("data-mirror", !!icon?.hasAttribute("data-mirror"))
}

/**
 * The selected item's icon, outside the list: in a select's trigger, or next
 * to a combobox's input. Rendered while one item is selected and it has an
 * icon. Its content is a copy of that icon's, so frameworks render it empty.
 */
function valueIconPart<
  State extends { icons: number },
  Api extends ValueIconApi,
>() {
  return {
    present: (state, { api }) => selectedIcon(api) !== undefined,
    attrs: () => ({ "aria-hidden": "true" }),
    bind(el, { api, store }) {
      let shown: Element | undefined
      const write = () => {
        const icon = selectedIcon(api)
        if (icon === shown) {
          return
        }
        shown = icon
        copyIcon(icon, el)
      }
      write()
      return store.subscribe(write)
    },
  } satisfies SlotDefinition<State, Api, BaseSlotProps, {}>
}

export {
  createItemIcons,
  itemIconPart,
  type ItemIconProps,
  type ItemIcons,
  itemIconsFeature,
  type ItemIconState,
  optionIcon,
  rememberIcon,
}
