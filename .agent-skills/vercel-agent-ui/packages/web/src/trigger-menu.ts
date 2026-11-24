import {
  triggerMenu,
  type TextEditorAdapter,
  type TriggerDefinition,
  type TriggerMenuApi,
} from "@ui-sdk/core/trigger-menu"
import {
  createParts,
  findOwner,
  instanceOf,
  wrappedChild,
} from "./define-element"
import { copy, renderListItems, stashedEmpty, templateOf } from "./list"
import { popupKinds, popupPortal, popupState } from "./popup"

const owner = "ui-trigger-menu"

// The properties rich values are set through.
type TriggerMenuElement = HTMLElement & {
  triggers?: TriggerDefinition<unknown>[]
  editor?: TextEditorAdapter
}

// Parts without content of their own, so the core writes their default text.
const automatic = new WeakSet<Element>()

// <ui-trigger-menu> suggests into the field inside it. Set `triggers` as a
// property. Markup:
//
// <ui-trigger-menu>
//   <ui-trigger-menu-input><textarea aria-label="Message"></textarea></ui-trigger-menu-input>
//   <ui-trigger-menu-content>
//     <ui-trigger-menu-empty>No matches</ui-trigger-menu-empty>
//     <ui-trigger-menu-list></ui-trigger-menu-list>
//   </ui-trigger-menu-content>
// </ui-trigger-menu>
//
// A list without items of its own renders the current trigger's data items.
// Inside a <ui-token-input>, it uses that editor and needs no input part.

// Parts that show the core's text when they have none of their own.
const automaticText = {
  render(el: HTMLElement) {
    if (!el.childNodes.length) {
      automatic.add(el)
    }
  },
  context: (el: HTMLElement) => ({ text: automatic.has(el) }),
  kinds: { text: null },
}

function defineTriggerMenuElements() {
  createParts(triggerMenu, {
    root: {
      tag: owner,
      defaults: { autoHighlight: true, loop: true, dismissible: true },
      display: "contents",
      kinds: popupKinds,
      options: (el) => {
        const menu = el as TriggerMenuElement
        return {
          triggers: menu.triggers ?? [],
          // Nesting is the default: a menu inside a token input uses its editor.
          editor: menu.editor ?? tokenInputEditor(el),
          container: undefined,
        }
      },
      state: popupState,
      api: [
        "isOpen",
        "setOpen",
        "open",
        "close",
        "getQuery",
        "getMatch",
        "insert",
        "focus",
      ],
      // The field's own `select`, for selected text, bubbles up here.
      events: { onSelect: "itemselect" },
      portal: popupPortal,
      // Data items follow the trigger, the level and the query.
      render(el, { api, subscribe }) {
        renderData(el, api)
        return subscribe(() => renderData(el, api))
      },
    },
    // A wrapper, so the field stays a real textarea or input.
    input: {
      tag: "ui-trigger-menu-input",
      display: "contents",
      target: wrappedChild("textarea, input"),
    },
    content: { tag: "ui-trigger-menu-content", kinds: popupKinds },
    list: { tag: "ui-trigger-menu-list", display: "block" },
    item: { tag: "ui-trigger-menu-item", display: "block" },
    // An icon inside a suggestion. Screen readers and filtering skip it.
    "item-icon": "ui-trigger-menu-item-icon",
    group: { tag: "ui-trigger-menu-group", display: "block" },
    "group-label": { tag: "ui-trigger-menu-group-label", display: "block" },
    separator: { tag: "ui-trigger-menu-separator", display: "block" },
    empty: { tag: "ui-trigger-menu-empty", ...stashedEmpty },
    // Without content, the status says the count and the keys.
    status: {
      tag: "ui-trigger-menu-status",
      display: "block",
      ...automaticText,
    },
    // Without content, the hint shows the arguments to type.
    hint: { tag: "ui-trigger-menu-hint", ...automaticText },
  })
}

// The editor of the token input around a menu, if any. A token input that
// upgrades later hands it over itself.
function tokenInputEditor(el: HTMLElement) {
  return instanceOf<{ editor: TextEditorAdapter }>(
    findOwner(el, "ui-token-input")
  )?.api.editor
}

// Items a data menu rendered, and the data each list last rendered.
const generatedItems = new WeakSet<Element>()
const rendered = new WeakMap<Element, unknown>()
// Remembered, since a container moves the content away.
const contents = new WeakMap<HTMLElement, Element>()

// The current trigger's data items, in a list without items of its own. A
// menu without content gets one.
function renderData(el: HTMLElement, api: TriggerMenuApi) {
  const template = templateOf(el)
  let content =
    el.querySelector(":scope > ui-trigger-menu-content") ?? contents.get(el)
  if (!content) {
    content = copy(template, "ui-trigger-menu-content", false)
    content.append(copy(template, "ui-trigger-menu-list", false))
    el.append(content)
  }
  contents.set(el, content)
  const list = content.querySelector("ui-trigger-menu-list")
  if (!list) {
    return
  }
  // Items of its own, in groups too, keep a list from rendering data.
  const own = Array.from(list.querySelectorAll("ui-trigger-menu-item")).some(
    (item) => {
      const group = item.closest("ui-trigger-menu-group")
      return !generatedItems.has(item) && !(group && generatedItems.has(group))
    }
  )
  const visible = api.internal.listbox.visibleData()?.list ?? []
  if (own || rendered.get(list) === visible) {
    return
  }
  rendered.set(list, visible)
  for (const child of Array.from(list.children)) {
    if (generatedItems.has(child)) {
      child.remove()
    }
  }
  const fresh = renderListItems(
    "ui-trigger-menu",
    visible,
    api.internal.keyOf,
    template
  )
  fresh.forEach((item) => generatedItems.add(item))
  list.prepend(...fresh)
}

export { defineTriggerMenuElements }
