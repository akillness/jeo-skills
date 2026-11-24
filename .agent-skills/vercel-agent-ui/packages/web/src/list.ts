import { flattenData, itemKey } from "@ui-sdk/core/renderer"
import type { ListData } from "@ui-sdk/core/select"

// The <template> right inside an element. The parts it renders from data copy
// the parts written there, with their classes and content.
const templateOf = (el: Element | null | undefined) =>
  el?.querySelector<HTMLTemplateElement>(":scope > template") ?? null

// A new part, or a copy of the template's part with the same tag. A container,
// like a group, copies only itself.
function copy(
  template: HTMLTemplateElement | null | undefined,
  tagName: string,
  deep = true
) {
  const model = template?.content.querySelector(tagName)
  return model
    ? (model.cloneNode(deep) as HTMLElement)
    : document.createElement(tagName)
}

// A part with attributes and text. The text goes in its text part, like
// <ui-select-item-text>, or first.
function element(
  tagName: string,
  attributes: Record<string, string | boolean | undefined> = {},
  text?: string,
  template?: HTMLTemplateElement | null
) {
  const el = copy(template, tagName)
  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined || value === false) {
      continue
    }
    el.setAttribute(name, value === true ? "" : value)
  }
  if (text) {
    const slot = el.querySelector(`${tagName}-text`)
    if (slot) {
      slot.textContent = text
    } else {
      el.prepend(text)
    }
  }
  return el
}

// "a, b" becomes ["a", "b"].
function listAttribute(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

// An item text part marks what it holds now, since marks keep the same text,
// so its props come from it, never from attributes.
const itemText = {
  context: (el: HTMLElement) => ({ text: el.textContent ?? "", write: true }),
  kinds: { text: null, write: null },
}

// An empty part, kept out of the page while the list has matches.
const stashedEmpty = {
  display: "block" as const,
  context: () => ({ stash: true }),
  kinds: { stash: null },
}

// The parts for data items, like <ui-select-item> and <ui-select-group>, copied
// from the template's. Values that aren't strings need `itemToValue` and are
// written as their key.
function renderListItems(
  prefix:
    | "ui-select"
    | "ui-combobox"
    | "ui-trigger-menu"
    | "ui-autocomplete"
    | "ui-command"
    | "ui-listbox",
  items: ListData<any>,
  toKey: (value: unknown) => string = (value) => String(value),
  template?: HTMLTemplateElement | null
) {
  return items.map((entry) => {
    if (typeof entry === "string") {
      return element(
        `${prefix}-item`,
        { value: entry, label: entry },
        entry,
        template
      )
    }
    if ("type" in entry && entry.type === "separator") {
      return element(`${prefix}-separator`, {}, "", template)
    }
    if ("type" in entry && entry.type === "group") {
      const group = copy(template, `${prefix}-group`, false)
      if (entry.label) {
        group.append(
          element(`${prefix}-group-label`, {}, entry.label, template)
        )
      }
      group.append(...renderListItems(prefix, entry.items, toKey, template))
      return group
    }
    const data = entry as {
      value: unknown
      label: string
      keywords?: string[]
      disabled?: boolean
      shortcut?: string
    }
    const el = element(
      `${prefix}-item`,
      { value: toKey(data.value), label: data.label, disabled: data.disabled },
      data.label,
      template
    )
    if (data.keywords) {
      el.setAttribute("keywords", data.keywords.join(","))
    }
    if (data.shortcut) {
      el.setAttribute("shortcut", data.shortcut)
    }
    return el
  })
}

// Attributes hold strings. With object items, a string names the item whose value has that key.
function valuesOf(
  keys: string[],
  items: ListData<unknown> | undefined,
  itemToValue?: (value: unknown) => string
) {
  if (!items) {
    return keys
  }
  const byKey = new Map(
    flattenData(items, (value) => itemKey(value, itemToValue)).map((entry) => [
      entry.key,
      entry,
    ])
  )
  return keys.map((key) => byKey.get(key)?.value ?? key)
}

// Elements read `default-value` when they connect, as keys while `items` are
// still to come. Once the items arrive, a value that still names those keys
// takes the items' values, with no change event, as if the items had been
// there from the start.
function adoptDefaultValue(
  el: HTMLElement,
  items: ListData<unknown> | undefined,
  api:
    | {
        getValue: () => unknown
        internal: {
          adoptValue: (value: unknown) => void
          options: () => { itemToValue?: (value: any) => string }
        }
      }
    | undefined
) {
  const start = el.getAttribute("default-value") ?? el.getAttribute("value")
  if (start === null || !items || !api) {
    return
  }
  const multiple =
    el.hasAttribute("multiple") && el.getAttribute("multiple") !== "false"
  const keys = multiple ? listAttribute(start) : [start]
  const current = api.getValue()
  const named = multiple
    ? Array.isArray(current) &&
      current.length === keys.length &&
      current.every((value, index) => value === keys[index])
    : current === keys[0]
  if (!named) {
    return
  }
  const values = valuesOf(keys, items, api.internal.options().itemToValue)
  if (values.every((value, index) => value === keys[index])) {
    return
  }
  api.internal.adoptValue(multiple ? values : values[0])
}

// Items an owner rendered from data, and the data each list last rendered.
const generatedItems = new WeakSet<Element>()
const renderedData = new WeakMap<Element, unknown>()

/** Whether a part was rendered from data, rather than written in the markup. */
const isGenerated = (el: Element) => generatedItems.has(el)

// Renders data items into a list part as copies of the template's parts. A list
// with items of its own anywhere in it, like a virtualized list's rows, skips
// data. Select-all options in the markup stay first, and anything else after.
function renderData(
  list: Element,
  prefix: "ui-select" | "ui-autocomplete" | "ui-command",
  visible: ListData<any>,
  template: HTMLTemplateElement | null,
  toKey?: (value: unknown) => string
) {
  const own = Array.from(list.querySelectorAll(`${prefix}-item`)).some(
    (item) => !generatedItems.has(item)
  )
  if (!own && renderedData.get(list) === visible) {
    return
  }
  if (own) {
    for (const child of Array.from(list.children)) {
      if (generatedItems.has(child)) {
        child.remove()
      }
    }
    renderedData.delete(list)
    return
  }
  renderedData.set(list, visible)
  const fresh = renderListItems(prefix, visible, toKey, template)
  for (const el of fresh) {
    generatedItems.add(el)
    el.querySelectorAll(`${prefix}-item`).forEach((item) =>
      generatedItems.add(item)
    )
  }
  placeItems(list, fresh, isGenerated, `${prefix}-select-all`)
}

// What each element rendered from data was copied from.
const madeFrom = new WeakMap<Element, string>()

// Puts data items into a list after its select-all option. An element whose
// item renders the same stays where it is, so a filter that narrows the list
// unbinds and binds again only what it adds or removes.
function placeItems(
  list: Element,
  fresh: Element[],
  owned: (el: Element) => boolean,
  selectAll: string
) {
  const kept = new Map<string, Element>()
  for (const child of list.children) {
    const made = madeFrom.get(child)
    if (made !== undefined && owned(child) && !kept.has(made)) {
      kept.set(made, child)
    }
  }
  const items = fresh.map((el) => {
    const made = el.outerHTML
    const old = kept.get(made)
    if (old) {
      kept.delete(made)
      return old
    }
    madeFrom.set(el, made)
    return el
  })
  const wanted = new Set(items)
  for (const child of Array.from(list.children)) {
    if (owned(child) && !wanted.has(child)) {
      child.remove()
    }
  }
  const current = Array.from(list.children).filter(owned)
  const end =
    Array.from(list.children).find(
      (child) => !owned(child) && child.localName !== selectAll
    ) ?? null
  const placed = new Set<Element>()
  let at = 0
  for (const el of items) {
    while (current[at] && placed.has(current[at])) {
      at++
    }
    if (current[at] === el) {
      at++
    } else {
      list.insertBefore(el, current[at] ?? end)
    }
    placed.add(el)
  }
}

export {
  adoptDefaultValue,
  copy,
  element,
  isGenerated,
  itemText,
  listAttribute,
  placeItems,
  renderData,
  renderListItems,
  stashedEmpty,
  templateOf,
  valuesOf,
}
