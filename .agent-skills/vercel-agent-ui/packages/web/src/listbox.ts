import {
  listbox,
  type ListData,
  type ListboxApi,
  type ListboxOptions,
} from "@ui-sdk/core/listbox"
import { createParts } from "./define-element"
import {
  adoptDefaultValue,
  listAttribute,
  renderListItems,
  templateOf,
  valuesOf,
} from "./list"

const owner = "ui-listbox"

// The properties rich values are set through.
type ListboxElement = HTMLElement &
  Pick<ListboxOptions<unknown>, "items" | "itemToValue" | "isItemEqualToValue">

// The items a data listbox rendered for itself, so new items replace them.
const generated = new WeakMap<HTMLElement, HTMLElement[]>()

// <ui-listbox> is the listbox itself, and takes part in forms like a native
// select, with no hidden input. Markup:
//
// <ui-listbox name="toppings" aria-label="Toppings" multiple>
//   <ui-listbox-item value="basil">Basil</ui-listbox-item>
//   <ui-listbox-group>
//     <ui-listbox-group-label>Vegetables</ui-listbox-group-label>
//     <ui-listbox-item value="onion">Onion</ui-listbox-item>
//   </ui-listbox-group>
// </ui-listbox>
//
// Set `items` to a data list and the element renders its items itself.
function defineListboxElements() {
  createParts(listbox, {
    root: {
      tag: owner,
      defaults: { loop: true, keepInView: true },
      formAssociated: true,
      display: "block",
      options: (el) => {
        const data = el as ListboxElement
        const multiple =
          el.hasAttribute("multiple") && el.getAttribute("multiple") !== "false"
        const start =
          el.getAttribute("default-value") ?? el.getAttribute("value")
        const toValues = (keys: string[]) =>
          valuesOf(keys, data.items, data.itemToValue)
        return {
          items: data.items,
          itemToValue: data.itemToValue,
          isItemEqualToValue: data.isItemEqualToValue,
          ...(start !== null && {
            defaultValue: multiple
              ? toValues(listAttribute(start))
              : toValues([start])[0],
          }),
        }
      },
      state: {
        value: {
          get: (api: ListboxApi) => api.getValue(),
          // A string names items by key, comma-separated with multiple.
          set: (api: ListboxApi, value: unknown) => {
            if (typeof value !== "string") {
              return api.setValue(value)
            }
            const multiple = !!api.internal.options().multiple
            const keys = multiple ? listAttribute(value) : [value]
            const found = keys.map(
              (key) => api.internal.listbox.valueOf(key) ?? key
            )
            api.setValue(multiple ? found : (found[0] ?? null))
          },
        },
      },
      api: ["getValue", "setValue", "clear", "selectAll", "focus"],
      // Runs again whenever `items` is set.
      render(el, { api }) {
        const { items } = el as ListboxElement
        generated.get(el)?.forEach((child) => child.remove())
        generated.delete(el)
        if (!items) {
          return
        }
        adoptDefaultValue(el, items as ListData<unknown>, api)
        const fresh = renderListItems(
          "ui-listbox",
          items as ListData<unknown>,
          api.internal.keyOf,
          templateOf(el)
        )
        generated.set(el, fresh)
        el.append(...fresh)
      },
    },
    item: { tag: "ui-listbox-item", display: "block" },
    "item-indicator": "ui-listbox-item-indicator",
    // An icon inside an item. Screen readers and typeahead skip it.
    "item-icon": "ui-listbox-item-icon",
    group: { tag: "ui-listbox-group", display: "block" },
    "group-label": { tag: "ui-listbox-group-label", display: "block" },
    separator: { tag: "ui-listbox-separator", display: "block" },
  })
}

export { defineListboxElements }
