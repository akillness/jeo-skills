import {
  select,
  type ListData,
  type SelectApi,
  type SelectOptions,
} from "@ui-sdk/core/select"
import {
  selectAllKey,
  selectItemIcons,
  selectSelectAll,
} from "@ui-sdk/core/renderer"
import {
  autoId,
  createParts,
  wrappedButton,
  wrappedChild,
} from "./define-element"
import { popupKinds, popupState, sheetPortal } from "./popup"
import {
  adoptDefaultValue,
  copy,
  itemText,
  listAttribute,
  renderData,
  renderListItems,
  stashedEmpty,
  templateOf,
  valuesOf,
} from "./list"

const owner = "ui-select"

// The properties rich values are set through.
type SelectElement = HTMLElement &
  Pick<
    SelectOptions<unknown>,
    "items" | "filter" | "itemToValue" | "itemToLabel" | "isItemEqualToValue"
  >

// The content a data select rendered for itself, so new items replace its children.
const generated = new WeakMap<HTMLElement, HTMLElement>()
// Value parts that had no content of their own, so the core writes the label into them.
const automatic = new WeakSet<Element>()
// The list in each select's markup, remembered, since a container may move the content away.
const markupLists = new WeakMap<Element, Element | null>()

// <ui-select> takes part in forms like a native select, with no hidden input.
// Markup:
//
// <ui-select name="fruit" placeholder="Pick a fruit">
//   <ui-select-label>Fruit</ui-select-label>
//   <ui-select-trigger><button></button></ui-select-trigger>
//   <ui-select-content>
//     <ui-select-item value="apple">Apple</ui-select-item>
//     <ui-select-item value="banana">Banana</ui-select-item>
//   </ui-select-content>
// </ui-select>
//
// The trigger shows the value when its button is empty. Set `items` to a data
// list, or write <option> and <optgroup> children, and the element renders its
// content itself. A <ui-select-input> wrapping an <input> in the content
// searches it; the items then go in a <ui-select-list>, which renders the
// data items that match when it has none of its own.
function defineSelectElements() {
  createParts(select, {
    root: {
      tag: owner,
      defaults: { loop: true, dismissible: true },
      formAssociated: true,
      display: "contents",
      kinds: popupKinds,
      // A filter function is a property; the attribute takes the named modes.
      properties: ["filter"],
      options: (el) => {
        const data = el as SelectElement
        const multiple =
          el.hasAttribute("multiple") && el.getAttribute("multiple") !== "false"
        const start =
          el.getAttribute("default-value") ?? el.getAttribute("value")
        const items = data.items ?? optionItems(el)
        const toValues = (keys: string[]) =>
          valuesOf(keys, items, data.itemToValue)
        return {
          items,
          ...((typeof data.filter === "function" || data.filter === false) && {
            filter: data.filter,
          }),
          itemToValue: data.itemToValue,
          itemToLabel: data.itemToLabel,
          isItemEqualToValue: data.isItemEqualToValue,
          container: undefined,
          ...(start !== null && {
            defaultValue: multiple
              ? toValues(listAttribute(start))
              : toValues([start])[0],
          }),
        }
      },
      state: {
        value: {
          get: (api: SelectApi) => api.getValue(),
          // A string names items by key, comma-separated with multiple.
          set: (api: SelectApi, value: unknown) => {
            if (typeof value !== "string") {
              return api.setValue(value)
            }
            const keys = api.internal.options().multiple
              ? listAttribute(value)
              : [value]
            const found = keys.map(
              (key) => api.internal.listbox.valueOf(key) ?? key
            )
            api.setValue(
              api.internal.options().multiple ? found : (found[0] ?? null)
            )
          },
        },
        query: {
          get: (api: SelectApi) => api.getQuery(),
          set: (api: SelectApi, query: string | null) =>
            api.setQuery(query ?? ""),
        },
        ...popupState,
      },
      api: [
        "isOpen",
        "setOpen",
        "open",
        "close",
        "toggle",
        "getValue",
        "setValue",
        "clear",
        "getQuery",
        "setQuery",
        "focus",
      ],
      portal: sheetPortal("ui-select-viewport"),
      // Runs again whenever `items` is set.
      render(el, { api, subscribe }) {
        const target = el as SelectElement
        const toKey = api.internal.keyOf
        const items = target.items ?? optionItems(el)
        const content = generated.get(el)
        const template = templateOf(el)
        if (!items) {
          content?.remove()
          generated.delete(el)
          return
        }
        adoptDefaultValue(el, items, api)
        if (content) {
          content.replaceChildren(
            ...renderListItems("ui-select", items, toKey, template)
          )
          return
        }
        // Markup content wins over data, but a list in it renders the items that match the search.
        const markup = el.querySelector(":scope > ui-select-content")
        if (markup && !markupLists.has(el)) {
          markupLists.set(el, markup.querySelector("ui-select-list"))
        }
        if (markupLists.has(el)) {
          renderSearched(target, api)
          return subscribe(() => renderSearched(target, api))
        }
        const created = copy(template, "ui-select-content", false)
        created.append(...renderListItems("ui-select", items, toKey, template))
        generated.set(el, created)
        el.append(created)
      },
    },
    label: { tag: "ui-select-label", display: "block" },
    // A wrapper, so the trigger stays a real button. An empty button shows the value.
    trigger: {
      tag: "ui-select-trigger",
      display: "contents",
      target: wrappedButton,
      render(el) {
        const target = wrappedButton(el)
        if (target && !target.childNodes.length) {
          target.append(document.createElement("ui-select-value"))
        }
      },
    },
    value: {
      tag: "ui-select-value",
      rebind: ["placeholder", "maxLabels", "getMoreLabel"],
      render(el) {
        if (!el.childNodes.length && !el.hasAttribute("as-child")) {
          automatic.add(el)
        }
      },
      context: (el) => ({ text: automatic.has(el) }),
      kinds: { text: null },
    },
    clear: {
      tag: "ui-select-clear",
      display: "contents",
      target: wrappedButton,
    },
    content: { tag: "ui-select-content", kinds: popupKinds },
    list: { tag: "ui-select-list", display: "block" },
    // A wrapper, so the search field stays a real input.
    input: {
      tag: "ui-select-input",
      display: "contents",
      target: wrappedChild("input"),
    },
    empty: { tag: "ui-select-empty", ...stashedEmpty },
    status: { tag: "ui-select-status", display: "block" },
    // Its text, with what the search matched in <mark>. It holds text only.
    "item-text": { tag: "ui-select-item-text", ...itemText },
    // Selects every item that matches, in its <ui-select-group> or in the whole list.
    "select-all": {
      tag: "ui-select-select-all",
      display: "block",
      feature: selectSelectAll,
      context: (el) => {
        const group = el.closest("ui-select-group")
        return { id: selectAllKey(group ? autoId(group) : undefined) }
      },
    },
    item: { tag: "ui-select-item", display: "block", properties: ["value"] },
    "item-indicator": "ui-select-item-indicator",
    // An icon inside an item. Screen readers, typeahead and the search skip it.
    "item-icon": { tag: "ui-select-item-icon", feature: selectItemIcons },
    // The selected item's icon, copied from its <ui-select-item-icon>, like before the value in the trigger.
    "value-icon": { tag: "ui-select-value-icon", feature: selectItemIcons },
    group: { tag: "ui-select-group", display: "block" },
    "group-label": { tag: "ui-select-group-label", display: "block" },
    separator: { tag: "ui-select-separator", display: "block" },
    arrow: { tag: "ui-select-arrow", display: "block" },
  })
}

// The data items that match the search, in the markup's list, unless it has items of its own.
function renderSearched(el: SelectElement, api: SelectApi) {
  const list = markupLists.get(el)
  const items = el.items ?? optionItems(el)
  if (!list || !items) {
    return
  }
  const visible = api.internal.listbox.visibleData()?.list ?? items
  renderData(list, "ui-select", visible, templateOf(el), api.internal.keyOf)
}

// Items from light-DOM <option> and <optgroup> children, so the markup works
// before the script loads and from server templates. They're hidden once read.
const fromOptions = new WeakMap<HTMLElement, ListData<string> | undefined>()
function optionItems(el: HTMLElement) {
  if (!fromOptions.has(el)) {
    fromOptions.set(el, readOptions(el))
  }
  return fromOptions.get(el)
}

function readOptions(el: HTMLElement) {
  const children = Array.from(el.children).filter(
    (child) => child.localName === "option" || child.localName === "optgroup"
  )
  if (!children.length) {
    return undefined
  }
  const read = (option: HTMLOptionElement) => ({
    value: option.value,
    label: option.label || option.textContent?.trim() || option.value,
    disabled: option.disabled || undefined,
  })
  const items = children.map((child) => {
    ;(child as HTMLElement).hidden = true
    if (child instanceof HTMLOptGroupElement) {
      return {
        type: "group" as const,
        label: child.label,
        items: Array.from(child.querySelectorAll("option")).map(read),
      }
    }
    return read(child as HTMLOptionElement)
  })
  return items
}

export { defineSelectElements }
