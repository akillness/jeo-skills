import { formatShortcut } from "@ui-sdk/core"
import { menu, type MenuData, type MenuDataItem } from "@ui-sdk/core/menu"
import {
  menuCheckable,
  menuContextTrigger,
  menuItemIcons,
} from "@ui-sdk/core/renderer"
import {
  autoId,
  definePart,
  findOwner,
  instanceOf,
  wrappedButton,
} from "./define-element"
import { copy, element, templateOf } from "./list"
import { menubarOf } from "./menubar"
import { popupApi, popupKinds, popupState, sheetPortal } from "./popup"

const owner = "ui-menu, ui-menu-sub"

// The content a data menu rendered for itself, so new items replace its children.
const generated = new WeakMap<HTMLElement, HTMLElement>()

type DataElement = HTMLElement & { items?: MenuData }

// <ui-menu> and its parts. Markup:
//
// <ui-menu>
//   <ui-menu-trigger><button>File</button></ui-menu-trigger>
//   <ui-menu-content>
//     <ui-menu-item value="new" shortcut="mod+n">New file</ui-menu-item>
//     <ui-menu-sub>
//       <ui-menu-sub-trigger>Share</ui-menu-sub-trigger>
//       <ui-menu-sub-content>
//         <ui-menu-item value="email">Email</ui-menu-item>
//       </ui-menu-sub-content>
//     </ui-menu-sub>
//   </ui-menu-content>
// </ui-menu>
//
// Or set `items` to a data menu and the element renders its content itself.
function defineMenuElements() {
  definePart(menu, "root", {
    tag: "ui-menu",
    kinds: { ...popupKinds, parent: null, menubar: null },
    defaults: { loop: true, itemShortcuts: true, dismissible: true },
    // Read when needed, since the menubar may upgrade after the menu.
    options: (el) => ({ container: undefined, menubar: () => menubarOf(el) }),
    // In a menubar, the wrappers sit between its items. Without this, screen
    // readers count each trigger as its own list of one.
    host: { role: "none" },
    state: popupState,
    api: popupApi,
    // Checkbox and radio parts fire their own `checkedchange` and `valuechange`,
    // which a listener on the menu hears with `{ capture: true }`.
    silent: ["onCheckedChange", "onValueChange"],
    // container="#id" renders the popup there, and a sheet's viewport with it.
    portal: sheetPortal("ui-menu-viewport"),
    // Runs again whenever `items` is set.
    render(el) {
      const { items } = el as DataElement
      const content = generated.get(el)
      if (!items) {
        content?.remove()
        generated.delete(el)
        return
      }
      const template = templateOf(el)
      if (content) {
        content.replaceChildren(...renderMenuItems(items, template))
        return
      }
      // Markup content wins over data.
      if (el.querySelector(":scope > ui-menu-content")) {
        return
      }
      const created = copy(template, "ui-menu-content", false)
      created.append(...renderMenuItems(items, template))
      generated.set(el, created)
      el.append(created)
    },
  })
  // A submenu inside the menu: its <ui-menu-sub-trigger> is an item that opens
  // its <ui-menu-sub-content> beside it.
  definePart(menu, "root", {
    tag: "ui-menu-sub",
    defaults: { loop: true },
    // The wrapper sits between items. Without this, screen readers count the
    // submenu trigger as its own list of one.
    host: { role: "none" },
    display: "contents",
    // A submenu opens from its parent, and takes none of the root menu's own options.
    kinds: {
      itemShortcuts: null,
      presentation: null,
      modal: null,
      dismissible: null,
      container: null,
      items: null,
      controller: null,
      parent: null,
      menubar: null,
    },
    options: (el) => ({
      parent: instanceOf(findOwner(el, owner))?.api as never,
    }),
    state: popupState,
    api: popupApi,
  })
  // A wrapper, so the trigger stays a real button with its built-in behavior.
  // With `for="menu-id"`, it opens that menu from anywhere on the page.
  definePart(menu, "trigger", {
    tag: "ui-menu-trigger",
    display: "contents",
    target: wrappedButton,
    render: (el) => el.setAttribute("role", "none"),
  })
  // An area that opens the menu at the pointer on a right-click or a long press, and on Shift+F10.
  definePart(menu, "context-trigger", {
    tag: "ui-menu-context-trigger",
    feature: menuContextTrigger,
    display: "block",
  })
  definePart(menu, "content", { tag: "ui-menu-content", kinds: popupKinds })
  definePart(menu, "content", {
    tag: "ui-menu-sub-content",
    // Moves with its root menu, so it names no container of its own.
    kinds: { container: null },
  })
  definePart(menu, "trigger", { tag: "ui-menu-sub-trigger", display: "block" })
  definePart(menu, "item", {
    tag: "ui-menu-item",
    display: "block",
    defaults: { closeOnSelect: true },
    // Items with a shortcut get its glyph, like React and Vue items, and it
    // follows the attribute.
    render: renderShortcut,
    changed: renderShortcut,
  })
  definePart(menu, "checkbox-item", {
    tag: "ui-menu-checkbox-item",
    feature: menuCheckable,
    display: "block",
  })
  definePart(menu, "radio-group", {
    tag: "ui-menu-radio-group",
    feature: menuCheckable,
    display: "block",
    // A `value` of null, as a property, controls the group with nothing
    // selected. No attribute can say that.
    properties: ["value"],
    // Its `name` attribute keys it, or a generated one.
    kinds: { name: null },
    context: (el) => ({ id: groupName(el), name: groupName(el) }),
  })
  definePart(menu, "radio-item", {
    tag: "ui-menu-radio-item",
    feature: menuCheckable,
    display: "block",
    context: (el) => ({
      group: groupName(el.closest("ui-menu-radio-group") ?? el),
    }),
  })
  // The check or dot inside a checkbox or radio item.
  definePart(menu, "item-indicator", {
    tag: "ui-menu-item-indicator",
    feature: menuCheckable,
    // The item and group around it say which they are.
    kinds: { item: null, itemKey: null, group: null },
    context: (el) => {
      const item = el.closest("ui-menu-checkbox-item, ui-menu-radio-item")
      if (!item) {
        return {}
      }
      const radio = item.localName === "ui-menu-radio-item"
      const group = item.closest("ui-menu-radio-group")
      return {
        item: radio ? "radio-item" : "checkbox-item",
        itemKey: item.getAttribute("value") ?? "",
        group: radio && group ? groupName(group) : undefined,
      }
    },
  })
  definePart(menu, "group", { tag: "ui-menu-group", display: "block" })
  definePart(menu, "group-label", {
    tag: "ui-menu-group-label",
    display: "block",
    kinds: { group: null },
    context: (el) => {
      const group = el.closest("ui-menu-group, ui-menu-radio-group") ?? el
      return {
        group:
          group.localName === "ui-menu-radio-group"
            ? groupName(group)
            : autoId(group),
      }
    },
  })
  definePart(menu, "separator", { tag: "ui-menu-separator", display: "block" })
  definePart(menu, "shortcut", "ui-menu-shortcut")
  // An icon inside an item. Screen readers and typeahead skip it.
  definePart(menu, "item-icon", {
    tag: "ui-menu-item-icon",
    feature: menuItemIcons,
  })
}

// Shortcut glyphs the element added to items, which follow the item's
// `shortcut`. One the markup wrote stays as it is.
const generatedShortcuts = new WeakSet<Element>()

function renderShortcut(item: HTMLElement) {
  const shortcut = item.getAttribute("shortcut")
  const glyph = item.querySelector(":scope > ui-menu-shortcut")
  if (!glyph) {
    if (!shortcut || item.querySelector("ui-menu-shortcut")) {
      return
    }
    const added = element("ui-menu-shortcut", {}, formatShortcut(shortcut))
    generatedShortcuts.add(added)
    item.append(added)
    return
  }
  if (!generatedShortcuts.has(glyph)) {
    return
  }
  if (shortcut) {
    glyph.textContent = formatShortcut(shortcut)
  } else {
    glyph.remove()
  }
}

// A radio group's key: its `name`, or a generated one.
function groupName(el: Element) {
  return el.getAttribute("name") ?? autoId(el)
}

// Builds the parts for a data menu's items, as copies of the parts in
// `template`, when given.
function renderMenuItems(
  items: MenuData,
  template?: HTMLTemplateElement | null
) {
  // An item, whose copied shortcut glyph follows its `shortcut` like one the element adds.
  const option = (
    tagName: string,
    attributes: Record<string, string | boolean | undefined>,
    label: string
  ) => {
    const el = element(tagName, attributes, label, template)
    const glyph = el.querySelector(":scope > ui-menu-shortcut")
    if (glyph) {
      generatedShortcuts.add(glyph)
    }
    return el
  }
  const closeOnSelect = (value?: boolean) =>
    value === undefined ? undefined : String(value)
  return items.map((entry) => {
    const item: MenuDataItem =
      typeof entry === "string" ? { value: entry, label: entry } : entry
    switch (item.type) {
      case undefined:
      case "item":
        return option(
          "ui-menu-item",
          {
            value: item.value,
            disabled: item.disabled,
            shortcut: item.shortcut,
            destructive: item.destructive,
            "close-on-select": closeOnSelect(item.closeOnSelect),
          },
          item.label
        )
      case "separator":
        return element("ui-menu-separator", {}, "", template)
      case "group": {
        const el = copy(template, "ui-menu-group", false)
        if (item.label) {
          el.append(element("ui-menu-group-label", {}, item.label, template))
        }
        el.append(...renderMenuItems(item.items, template))
        return el
      }
      case "checkbox":
        return option(
          "ui-menu-checkbox-item",
          {
            value: item.value,
            disabled: item.disabled,
            checked:
              item.checked === undefined ? undefined : String(item.checked),
            "default-checked": item.defaultChecked,
            "close-on-select": closeOnSelect(item.closeOnSelect),
          },
          item.label
        )
      case "radio-group": {
        const el = copy(template, "ui-menu-radio-group", false)
        if (item.name) {
          el.setAttribute("name", item.name)
        }
        if (item.value != null) {
          el.setAttribute("value", item.value)
        }
        if (item.defaultValue != null) {
          el.setAttribute("default-value", item.defaultValue)
        }
        // Controlled with nothing selected, like React and Vue.
        if (item.value === null) {
          Object.assign(el, { value: null })
        }
        if (item.label) {
          el.append(element("ui-menu-group-label", {}, item.label, template))
        }
        el.append(
          ...item.items.map((radio) =>
            option(
              "ui-menu-radio-item",
              { value: radio.value, disabled: radio.disabled },
              radio.label
            )
          )
        )
        return el
      }
      case "submenu": {
        const sub = copy(template, "ui-menu-sub", false)
        const trigger = element(
          "ui-menu-sub-trigger",
          { disabled: item.disabled },
          item.label,
          template
        )
        const content = copy(template, "ui-menu-sub-content", false)
        content.append(...renderMenuItems(item.items, template))
        sub.append(trigger, content)
        return sub
      }
    }
  })
}

export { defineMenuElements, renderMenuItems }
