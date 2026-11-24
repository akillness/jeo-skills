import {
  autocomplete,
  type AutocompleteApi,
  type ListData,
} from "@ui-sdk/core/autocomplete"
import { createParts, wrappedChild } from "./define-element"
import { copy, itemText, renderData, stashedEmpty, templateOf } from "./list"
import { popupKinds, popupState, sheetInputPortal } from "./popup"

const owner = "ui-autocomplete"

// The properties rich values are set through.
type AutocompleteElement = HTMLElement & {
  items?: ListData<string>
}

// The list each data autocomplete renders into, kept since a container may move it away.
const lists = new WeakMap<Element, Element>()

// <ui-autocomplete> is a text field that suggests as you type. The <input>
// inside is the form control, so its text submits under the element's `name`.
// Listen for `valuechange` and `submit`. Markup:
//
// <ui-autocomplete name="fruit">
//   <ui-autocomplete-label>Fruit</ui-autocomplete-label>
//   <ui-autocomplete-input><input /></ui-autocomplete-input>
//   <ui-autocomplete-content>
//     <ui-autocomplete-empty>No fruits found</ui-autocomplete-empty>
//     <ui-autocomplete-list>
//       <ui-autocomplete-item value="apple">Apple</ui-autocomplete-item>
//     </ui-autocomplete-list>
//   </ui-autocomplete-content>
// </ui-autocomplete>
//
// Set `items` and the element renders its suggestions.
function defineAutocompleteElements() {
  createParts(autocomplete, {
    root: {
      tag: owner,
      defaults: { loop: true, dismissible: true },
      display: "contents",
      kinds: popupKinds,
      // A filter function is a property; the attribute takes the named modes.
      properties: ["filter"],
      options: (el) => {
        const data = el as AutocompleteElement & { filter?: unknown }
        return {
          items: data.items,
          ...((typeof data.filter === "function" || data.filter === false) && {
            filter: data.filter as never,
          }),
          container: undefined,
          onSubmit: (value: string, { event }: { event?: Event }) =>
            submitted(el, value, event),
        }
      },
      state: {
        value: {
          get: (api: AutocompleteApi) => api.getValue(),
          set: (api: AutocompleteApi, value: string | null) =>
            api.setValue(value ?? ""),
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
        "focus",
      ],
      // container="#id" renders the suggestions there. As a sheet, they sit in a
      // viewport there and the field moves into its header.
      portal: sheetInputPortal("ui-autocomplete-viewport"),
      // Runs again whenever `items` is set. Data suggestions follow the text.
      render(el, instance) {
        const target = el as AutocompleteElement
        renderSuggestions(target, instance.api)
        return instance.subscribe(() => renderSuggestions(target, instance.api))
      },
    },
    label: { tag: "ui-autocomplete-label", display: "block" },
    // Wrappers, so the field stays a real input and the buttons real buttons.
    input: {
      tag: "ui-autocomplete-input",
      display: "contents",
      target: wrappedChild("input"),
    },
    trigger: {
      tag: "ui-autocomplete-trigger",
      display: "contents",
      target: wrappedChild("button"),
    },
    clear: {
      tag: "ui-autocomplete-clear",
      display: "contents",
      target: wrappedChild("button"),
    },
    content: { tag: "ui-autocomplete-content", kinds: popupKinds },
    list: { tag: "ui-autocomplete-list", display: "block" },
    item: { tag: "ui-autocomplete-item", display: "block" },
    // Its text, with what the field's text matched in <mark>. It holds text only.
    "item-text": { tag: "ui-autocomplete-item-text", ...itemText },
    // An icon inside a suggestion. Screen readers and filtering skip it.
    "item-icon": "ui-autocomplete-item-icon",
    group: { tag: "ui-autocomplete-group", display: "block" },
    "group-label": { tag: "ui-autocomplete-group-label", display: "block" },
    separator: { tag: "ui-autocomplete-separator", display: "block" },
    empty: { tag: "ui-autocomplete-empty", ...stashedEmpty },
    status: { tag: "ui-autocomplete-status", display: "block" },
    arrow: { tag: "ui-autocomplete-arrow", display: "block" },
  })
}

// Fires `submit` on the element, with the text. It doesn't bubble, so the
// form around it never takes it for its own. Canceling it keeps the form from submitting.
function submitted(el: HTMLElement, value: string, event?: Event) {
  const submit = new CustomEvent("submit", {
    cancelable: true,
    composed: true,
    detail: { value },
  })
  if (!el.dispatchEvent(submit)) {
    event?.preventDefault()
  }
}

// The suggestions that match, in the list part, or in content the element adds.
function renderSuggestions(el: AutocompleteElement, api: AutocompleteApi) {
  if (!el.items) {
    return
  }
  const template = templateOf(el)
  let list =
    lists.get(el) ??
    [
      ...el.querySelectorAll("ui-autocomplete-content ui-autocomplete-list"),
    ].find((found) => found.closest("ui-autocomplete") === el)
  if (!list) {
    const created = copy(template, "ui-autocomplete-content", false)
    list = copy(template, "ui-autocomplete-list", false)
    created.append(list)
    el.append(created)
  }
  lists.set(el, list)
  const visible = api.internal.listbox.visibleData()?.list ?? el.items
  renderData(list, "ui-autocomplete", visible as ListData<string>, template)
}

export { defineAutocompleteElements }
