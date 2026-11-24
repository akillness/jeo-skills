import {
  command,
  type CommandApi,
  type CommandData,
} from "@ui-sdk/core/command"
import { pageItems } from "@ui-sdk/core/renderer"
import { createParts, wrappedChild } from "./define-element"
import {
  copy,
  isGenerated,
  itemText,
  listAttribute,
  renderData,
  stashedEmpty,
  templateOf,
} from "./list"

// The properties rich values are set through.
type CommandElement = HTMLElement & {
  items?: CommandData
}

// <ui-command> is a search field over an always-open list of commands.
// Listen for `action`, whose `detail.value` is the command that ran, and pass
// a Promise to `detail.waitUntil()` to keep it pending. Markup:
//
// <ui-command>
//   <ui-command-input><input aria-label="Search commands" /></ui-command-input>
//   <ui-command-empty>No results found.</ui-command-empty>
//   <ui-command-list>
//     <ui-command-group>
//       <ui-command-group-label>Settings</ui-command-group-label>
//       <ui-command-item value="profile" shortcut="mod+p">Profile<ui-command-shortcut></ui-command-shortcut></ui-command-item>
//     </ui-command-group>
//   </ui-command-list>
// </ui-command>
//
// Set `items` and the element renders the list itself.
function defineCommandElements() {
  createParts(command, {
    root: {
      tag: "ui-command",
      display: "block",
      defaults: { autoHighlight: true, loop: true },
      // A filter function is a property; the attribute takes the named modes.
      properties: ["filter"],
      options: (el) => {
        const data = el as CommandElement & { filter?: unknown }
        return {
          items: data.items,
          ...((typeof data.filter === "function" || data.filter === false) && {
            filter: data.filter as never,
          }),
        }
      },
      state: {
        value: {
          get: (api: CommandApi) => api.getValue(),
          set: (api: CommandApi, value: string | null) =>
            api.setValue(value || null),
        },
        query: {
          get: (api: CommandApi) => api.getQuery(),
          set: (api: CommandApi, query: string | null) =>
            api.setQuery(query ?? ""),
        },
        pages: {
          get: (api: CommandApi) => api.getPages(),
          set: (api: CommandApi, pages: string | string[] | null) =>
            api.setPages(
              typeof pages === "string" ? listAttribute(pages) : (pages ?? [])
            ),
        },
      },
      api: [
        "getValue",
        "setValue",
        "getQuery",
        "setQuery",
        "getPages",
        "setPages",
        "push",
        "pop",
        "run",
        "focus",
      ],
      // Runs again whenever `items` is set. Data commands follow the text and the page.
      render(el, instance) {
        const target = el as CommandElement
        renderCommands(target, instance.api)
        return instance.subscribe(() => renderCommands(target, instance.api))
      },
    },
    // A wrapper, so the field stays a real input.
    input: {
      tag: "ui-command-input",
      display: "contents",
      target: wrappedChild("input"),
    },
    list: { tag: "ui-command-list", display: "block" },
    // Its text, with what the search matched in <mark>. It holds text only.
    "item-text": { tag: "ui-command-item-text", ...itemText },
    item: {
      tag: "ui-command-item",
      display: "block",
      // Whether it came from `items`, and the page it's on: null on a page
      // without a value, the first one.
      context: (el) => {
        const page = el.closest("ui-command-page")
        return {
          data: isGenerated(el),
          ...(page && { inPage: page.getAttribute("value") }),
        }
      },
      kinds: { data: null, inPage: null },
    },
    shortcut: {
      tag: "ui-command-shortcut",
      // Its own `shortcut`, else its command's.
      kinds: { shortcut: { kind: "string", from: "item" } },
    },
    // A wrapper that doesn't split the list for assistive technology.
    page: { tag: "ui-command-page", display: "contents" },
    // An icon inside a command. Screen readers and filtering skip it.
    "item-icon": "ui-command-item-icon",
    group: { tag: "ui-command-group", display: "block" },
    "group-label": { tag: "ui-command-group-label", display: "block" },
    separator: { tag: "ui-command-separator", display: "block" },
    empty: { tag: "ui-command-empty", ...stashedEmpty },
    status: { tag: "ui-command-status", display: "block" },
  })
}

// The current page's data commands, in the list part, or one the element adds.
function renderCommands(el: CommandElement, api: CommandApi) {
  if (!el.items) {
    return
  }
  const template = templateOf(el)
  let list = el.querySelector(":scope > ui-command-list")
  if (!list) {
    list = copy(template, "ui-command-list", false)
    el.append(list)
  }
  const visible =
    api.internal.listbox.visibleData()?.list ??
    pageItems(el.items, api.getPages()) ??
    []
  renderData(list, "ui-command", visible as CommandData, template)
}

export { defineCommandElements }
