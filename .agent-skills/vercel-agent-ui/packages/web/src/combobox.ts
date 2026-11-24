import {
  combobox,
  type ComboboxApi,
  type ComboboxOptions,
} from "@ui-sdk/core/combobox"
import {
  comboboxChips,
  comboboxCreate,
  comboboxItemIcons,
  comboboxSelectAll,
  selectAllKey,
} from "@ui-sdk/core/renderer"
import { autoId, createParts, findOwner, wrappedChild } from "./define-element"
import {
  adoptDefaultValue,
  copy,
  element,
  itemText,
  listAttribute,
  placeItems,
  renderListItems,
  stashedEmpty,
  templateOf,
  valuesOf,
} from "./list"
import { popupKinds, popupState, sheetInputPortal } from "./popup"

const owner = "ui-combobox"

// The properties rich values are set through.
type ComboboxElement = HTMLElement &
  Pick<
    ComboboxOptions<unknown>,
    "items" | "filter" | "itemToValue" | "itemToLabel" | "isItemEqualToValue"
  >

const generated = new WeakMap<HTMLElement, HTMLElement>()
// The chips the element rendered, so it can tell them from chips the page renders.
const renderedChip = new WeakSet<Element>()
// Create parts without content of their own, so the core writes the offer into them.
const automaticCreate = new WeakSet<Element>()
// Overflow parts without content of their own, so the core writes the count into them.
const automaticOverflow = new WeakSet<Element>()

// <ui-combobox> takes part in forms like a native control, with no hidden
// input. Markup:
//
// <ui-combobox name="country">
//   <ui-combobox-label>Country</ui-combobox-label>
//   <ui-combobox-input><input /></ui-combobox-input>
//   <ui-combobox-content>
//     <ui-combobox-empty>No countries found</ui-combobox-empty>
//     <ui-combobox-list>
//       <ui-combobox-item value="ar">Argentina</ui-combobox-item>
//     </ui-combobox-list>
//   </ui-combobox-content>
// </ui-combobox>
//
// With `multiple`, an empty <ui-combobox-chips> around the input renders a chip
// per value, with a remove button. Set `items` and the element renders its list.
function defineComboboxElements() {
  createParts(combobox, {
    root: {
      tag: owner,
      defaults: { loop: true, dismissible: true },
      formAssociated: true,
      display: "contents",
      kinds: popupKinds,
      // A filter function is a property; the attribute takes the named modes.
      properties: ["filter"],
      options: (el) => {
        const data = el as ComboboxElement
        const multiple =
          el.hasAttribute("multiple") && el.getAttribute("multiple") !== "false"
        const start =
          el.getAttribute("default-value") ?? el.getAttribute("value")
        const items = data.items
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
          get: (api: ComboboxApi) => api.getValue(),
          // A string names items by key, comma-separated with multiple.
          set: (api: ComboboxApi, value: unknown) => {
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
          get: (api: ComboboxApi) => api.getQuery(),
          set: (api: ComboboxApi, query: string | null) =>
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
      // container="#id" renders the list there. As a sheet, the list sits in a
      // viewport there and the input moves into its header.
      portal: sheetInputPortal("ui-combobox-viewport"),
      // Runs again whenever `items` is set.
      render(el, { api, subscribe }) {
        const target = el as ComboboxElement
        adoptDefaultValue(el, target.items, api)
        // Setting `items` renders the chips again.
        renderChips(target, api, { force: true })
        renderData(target, api)
        // Chips and data items follow the value and the text.
        return subscribe(() => {
          renderChips(target, api)
          renderData(target, api)
        })
      },
    },
    label: { tag: "ui-combobox-label", display: "block" },
    // A wrapper, so the input stays a real input.
    input: {
      tag: "ui-combobox-input",
      display: "contents",
      target: wrappedChild("input"),
    },
    trigger: {
      tag: "ui-combobox-trigger",
      display: "contents",
      target: wrappedChild("button"),
    },
    clear: {
      tag: "ui-combobox-clear",
      display: "contents",
      target: wrappedChild("button"),
    },
    content: { tag: "ui-combobox-content", kinds: popupKinds },
    list: { tag: "ui-combobox-list", display: "block" },
    item: { tag: "ui-combobox-item", display: "block" },
    "item-indicator": "ui-combobox-item-indicator",
    // An icon inside an item. Screen readers and filtering skip it.
    "item-icon": { tag: "ui-combobox-item-icon", feature: comboboxItemIcons },
    // The selected item's icon, copied from its <ui-combobox-item-icon>, like next to the input.
    "value-icon": { tag: "ui-combobox-value-icon", feature: comboboxItemIcons },
    group: { tag: "ui-combobox-group", display: "block" },
    "group-label": { tag: "ui-combobox-group-label", display: "block" },
    separator: { tag: "ui-combobox-separator", display: "block" },
    // Without content, it offers to create the text: Create “…”. Listen for `create`.
    create: {
      tag: "ui-combobox-create",
      display: "block",
      feature: comboboxCreate,
      render(el) {
        if (!el.childNodes.length) {
          automaticCreate.add(el)
        }
      },
      kinds: { text: null },
      context: (el) => ({
        onCreate: (query: string) => created(el, query),
        text: automaticCreate.has(el),
      }),
    },
    empty: { tag: "ui-combobox-empty", ...stashedEmpty },
    status: { tag: "ui-combobox-status", display: "block" },
    chips: {
      tag: "ui-combobox-chips",
      feature: comboboxChips,
      display: "block",
    },
    chip: { tag: "ui-combobox-chip", feature: comboboxChips, display: "block" },
    // "+2 more" once chips don't fit on the chips' line. Rendering it turns collapsing on.
    "chips-overflow": {
      tag: "ui-combobox-chips-overflow",
      feature: comboboxChips,
      render(el) {
        if (!el.childNodes.length) {
          automaticOverflow.add(el)
        }
      },
      context: (el) => ({ text: automaticOverflow.has(el) }),
      kinds: { text: null },
    },
    // Its text, with what the input's text matched in <mark>. It holds text only.
    "item-text": { tag: "ui-combobox-item-text", ...itemText },
    // Selects every item that matches, in its <ui-combobox-group> or in the whole list.
    "select-all": {
      tag: "ui-combobox-select-all",
      display: "block",
      feature: comboboxSelectAll,
      context: (el) => {
        const group = el.closest("ui-combobox-group")
        return { id: selectAllKey(group ? autoId(group) : undefined) }
      },
    },
    "chip-remove": {
      tag: "ui-combobox-chip-remove",
      feature: comboboxChips,
      display: "contents",
      target: wrappedChild("button"),
      context: (el) => ({
        value: el.closest("ui-combobox-chip")?.getAttribute("value") ?? "",
      }),
    },
    arrow: { tag: "ui-combobox-arrow", display: "block" },
  })
}

// Fires a `create` event with the text on the combobox, wherever its list
// renders. `detail.waitUntil(promise)` marks the option pending until the promise settles.
function created(el: HTMLElement, query: string) {
  let pending: Promise<unknown> | undefined
  ;(findOwner(el, owner) ?? el).dispatchEvent(
    new CustomEvent("create", {
      composed: true,
      detail: {
        value: query,
        waitUntil: (promise: Promise<unknown>) => (pending = promise),
      },
    })
  )
  return pending
}

// The value and labels each chips part last rendered, so changes that leave
// both alone, like the highlight moving, skip it.
const renderedChips = new WeakMap<Element, { value: unknown; labels: string }>()

// One chip per value, with a remove button named after it, until the page
// renders chips of its own. The page's chips go in before the state commits,
// from the change event, so the element's never show beside them.
function renderChips(
  el: ComboboxElement,
  api: ComboboxApi,
  { force = false, settled = false } = {}
) {
  const chips = el.querySelector("ui-combobox-chips")
  if (!chips) {
    return
  }
  // The page's chips can sit in a wrapper of their own; the element's are children.
  const all = Array.from(
    chips.querySelectorAll<HTMLElement>("ui-combobox-chip")
  )
  if (all.some((chip) => !renderedChip.has(chip))) {
    for (const chip of all) {
      if (renderedChip.has(chip)) {
        chip.remove()
      }
    }
    renderedChips.delete(chips)
    return
  }
  const children = all.filter((chip) => chip.parentElement === chips)
  const value = api.getValue()
  const { selection } = api.internal
  const values = selection.values()
  const labels = values.map((selected) => api.internal.labelOf(selected))
  // A label learned after the value, like once the items load, renders the chips again too.
  const last = renderedChips.get(chips)
  const joined = labels.join("\n")
  if (!force && last && last.value === value && last.labels === joined) {
    return
  }
  const keys = selection.keys()
  const kept = new Set(keys)
  const existing = new Map(
    children.map((chip) => [chip.getAttribute("value"), chip])
  )
  // A page that sets `value` quietly, like lit, renders its own chips after.
  // New chips wait a microtask for them.
  if (!settled && keys.some((key) => !existing.has(key))) {
    return void queueMicrotask(() =>
      renderChips(el, api, { force, settled: true })
    )
  }
  renderedChips.set(chips, { value, labels: joined })
  // Chips that stay keep their element, so focus on one survives a neighbour's removal.
  for (const [key, chip] of existing) {
    if (!kept.has(key ?? "")) {
      chip.remove()
    }
  }
  // Chips go before the overflow part, if there is one, and the input.
  const input =
    chips.querySelector(":scope > ui-combobox-chips-overflow") ??
    chips.querySelector("ui-combobox-input")
  for (const [index, key] of keys.entries()) {
    let chip = existing.get(key)
    if (!chip) {
      // A copy of the template's chip, with its remove button, or a new one.
      chip = copy(templateOf(el), "ui-combobox-chip")
      renderedChip.add(chip)
      chip.setAttribute("value", key)
      if (!chip.querySelector(":scope > ui-combobox-chip-remove")) {
        const remove = element("ui-combobox-chip-remove")
        remove.append(element("button", { type: "button" }, "×"))
        chip.append(remove)
      }
      chip.prepend(document.createTextNode(""))
    }
    // Labels that change after the chips rendered reach them too.
    const label = labels[index]
    const text = chip.firstChild
    if (text?.nodeType === Node.TEXT_NODE && text.textContent !== label) {
      text.textContent = label
    }
    chip
      .querySelector(":scope > ui-combobox-chip-remove > button")
      ?.setAttribute("aria-label", `Remove ${label}`)
    chips.insertBefore(chip, input)
  }
}

// Items a data combobox rendered, and the data each list last rendered.
const generatedItems = new WeakSet<Element>()
const markupLists = new WeakMap<Element, Element | null>()
const rendered = new WeakMap<Element, unknown>()

// The list a data combobox renders: the items that match the text.
function renderData(el: ComboboxElement, api: ComboboxApi) {
  const { items } = el
  const content = generated.get(el)
  if (!items) {
    content?.remove()
    generated.delete(el)
    return
  }
  const visible = api.internal.listbox.visibleData()?.list ?? items
  const toKey = api.internal.keyOf
  // Markup content wins over data, but a list in it without items of its own
  // renders them. Remembered, since a container may move the content away.
  const markup = [...el.querySelectorAll("ui-combobox-content")].find(
    (found) => found !== content && found.closest("ui-combobox") === el
  )
  if (markup && !markupLists.has(el)) {
    markupLists.set(el, markup.querySelector("ui-combobox-list"))
  }
  const list = markupLists.has(el)
    ? (markupLists.get(el) ?? null)
    : (content?.querySelector("ui-combobox-list") ?? null)
  if (markupLists.has(el) && !list) {
    return
  }
  if (list) {
    if (!markup && !content && !list.isConnected) {
      return
    }
    const own = Array.from(list.children).some(
      (child) =>
        child.localName === "ui-combobox-item" && !generatedItems.has(child)
    )
    if (own || rendered.get(list) === visible) {
      return
    }
    rendered.set(list, visible)
    const fresh = renderListItems("ui-combobox", visible, toKey, templateOf(el))
    fresh.forEach((item) => generatedItems.add(item))
    placeItems(
      list,
      fresh,
      (child) => generatedItems.has(child),
      "ui-combobox-select-all"
    )
    return
  }
  const template = templateOf(el)
  const created = copy(template, "ui-combobox-content", false)
  const fresh = copy(template, "ui-combobox-list", false)
  created.append(fresh)
  generated.set(el, created)
  el.append(created)
  renderData(el, api)
}

export { defineComboboxElements }
