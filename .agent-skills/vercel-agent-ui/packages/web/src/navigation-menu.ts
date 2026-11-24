import {
  navigationMenu,
  type NavigationMenuApi,
} from "@ui-sdk/core/navigation-menu"
import {
  autoId,
  createParts,
  findContainer,
  findOwner,
  instanceOf,
} from "./define-element"

const owner = "ui-navigation-menu"

// The item an element sits in, by value. Contents move into the viewport as
// they open, so the answer is kept from when they were still in their item.
const items = new WeakMap<Element, string>()
function itemOf(el: HTMLElement) {
  const item = el.closest("ui-navigation-menu-item")
  if (item) {
    items.set(el, item.getAttribute("value") ?? autoId(item))
  }
  return items.get(el)
}

// The menu and item a nested menu sits in: the content around it, which may
// have moved into its menu's viewport.
function parentOf(el: HTMLElement) {
  const content = el.parentElement?.closest<HTMLElement>(
    "ui-navigation-menu-content"
  )
  const item = content && itemOf(content)
  const api =
    content && instanceOf<NavigationMenuApi>(findOwner(content, owner))?.api
  return api && item ? { api, item } : undefined
}

// Contents render into the viewport while their item is open, else in place,
// or into the menu's container as their own popup without a viewport. Only a
// `container` the menu names counts: a nested menu sits in a content that
// moved into its parent's viewport, which is no container for its popups.
const portal = {
  slots: ["content", "viewport"],
  container(
    el: HTMLElement,
    part: { slot: string; props: Record<string, unknown> }
  ) {
    const selector = el.getAttribute("container")
    const container = selector ? findContainer(el, selector) : null
    if (part.slot === "viewport") {
      return container
    }
    const api = instanceOf<NavigationMenuApi>(el)?.api
    const viewport = api?.internal.viewportElement()
    if (viewport && api?.internal.inViewport(String(part.props.value))) {
      return viewport
    }
    return viewport ? null : container
  },
}

// <ui-navigation-menu> and its parts. Markup:
//
// <ui-navigation-menu aria-label="Main">
//   <ui-navigation-menu-list>
//     <ui-navigation-menu-item value="products">
//       <ui-navigation-menu-trigger><button>Products</button></ui-navigation-menu-trigger>
//       <ui-navigation-menu-content>
//         <ui-navigation-menu-link><a href="/analytics">Analytics</a></ui-navigation-menu-link>
//       </ui-navigation-menu-content>
//     </ui-navigation-menu-item>
//   </ui-navigation-menu-list>
//   <ui-navigation-menu-indicator></ui-navigation-menu-indicator>
//   <ui-navigation-menu-viewport></ui-navigation-menu-viewport>
// </ui-navigation-menu>
function defineNavigationMenuElements() {
  createParts(navigationMenu, {
    root: {
      tag: owner,
      defaults: { openOnHover: true, closeOnSelect: true },
      display: "block",
      // `container="#id"` is a selector, and the menu a nested one sits in is never an attribute or a property.
      kinds: { container: "string", parent: null },
      // A nested menu closes with its parent, and the container is the adapter's.
      options: (el) => ({ parent: parentOf(el), container: undefined }),
      // `value` is live: setting the property or the attribute opens that item, like a controller.
      state: {
        value: {
          get: (api: NavigationMenuApi) => api.getValue(),
          set: (api: NavigationMenuApi, value: string | null) =>
            api.setValue(value || null),
        },
      },
      api: ["getValue", "setValue", "isOpen", "close", "focus"],
      portal,
      // A landmark, unless it's nested inside another menu's content.
      render(el, instance) {
        if (!el.hasAttribute("role") && !instance.get().nested) {
          el.setAttribute("role", "navigation")
        }
      },
    },
    list: {
      tag: "ui-navigation-menu-list",
      display: "block",
      render: (el) => el.setAttribute("role", "list"),
    },
    item: {
      tag: "ui-navigation-menu-item",
      display: "block",
      render: (el) => el.setAttribute("role", "listitem"),
    },
    // A wrapper, so the trigger stays a real button.
    trigger: {
      tag: "ui-navigation-menu-trigger",
      display: "contents",
      context: (el) => ({ value: itemOf(el) }),
      target: (el) =>
        el.querySelector<HTMLElement>("button") ??
        (el.firstElementChild as HTMLElement),
    },
    // A block, so a closed content kept findable has a box for
    // `hidden="until-found"` to hide; an inline one would show its links. Not
    // shown, it's always `hidden`, which wins over any display.
    content: {
      tag: "ui-navigation-menu-content",
      display: "block",
      kinds: { container: null },
      context: (el) => ({ value: itemOf(el) }),
    },
    // A wrapper, so the link stays a real link, or any element with as-child.
    link: {
      tag: "ui-navigation-menu-link",
      display: "contents",
      target: (el) =>
        el.querySelector<HTMLElement>("a") ??
        (el.firstElementChild as HTMLElement),
    },
    // An icon inside a link. Screen readers skip it.
    "link-icon": "ui-navigation-menu-link-icon",
    viewport: {
      tag: "ui-navigation-menu-viewport",
      kinds: { container: null },
    },
    indicator: { tag: "ui-navigation-menu-indicator", display: "block" },
  })
}

export { defineNavigationMenuElements }
