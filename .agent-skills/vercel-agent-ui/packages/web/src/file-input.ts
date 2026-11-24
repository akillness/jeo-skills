import {
  fileInput,
  formatFileSize,
  relativePath,
  type FileInputApi,
} from "@ui-sdk/core/file-input"
import { fileKey } from "@ui-sdk/core/renderer"
import { createParts } from "./define-element"
import { element } from "./list"

const owner = "ui-file-input"

type ItemElement = HTMLElement & { file?: File }

// <ui-file-input> holds the files as its `value`, and is form-associated: it
// submits them under its name, like a native file input. Every part is
// optional. The trigger wraps your button:
//
// <ui-file-input name="attachments" accept="image/*,.pdf" multiple>
//   <ui-file-input-dropzone>
//     <p>Drop files here, or</p>
//     <ui-file-input-trigger><button>Browse files</button></ui-file-input-trigger>
//   </ui-file-input-dropzone>
//   <ui-file-input-list></ui-file-input-list>
// </ui-file-input>
//
// The list renders an item for each file, from a <template> inside it when
// there is one. Elements in the item with `data-file="name"`, `"size"`,
// `"type"` or `"path"` show that about the file.
function defineFileInputElements() {
  createParts(fileInput, {
    root: {
      tag: owner,
      display: "block",
      formAssociated: true,
      // `value` is live, and `defaultValue` is the files a form reset returns to.
      state: {
        value: {
          get: (api: FileInputApi) => api.getValue(),
          set: (api: FileInputApi, files: readonly File[] | null) =>
            api.setValue(files ?? []),
        },
      },
      api: [
        "getValue",
        "setValue",
        "addFiles",
        "removeFile",
        "clear",
        "open",
        "focus",
        "isDragging",
      ],
      // The picker's input is generated inside, once.
      children: {
        input: (el) => {
          const existing = el.querySelector<HTMLInputElement>(
            ':scope > input[type="file"]'
          )
          if (existing) {
            return existing
          }
          const input = el.ownerDocument.createElement("input")
          input.type = "file"
          el.append(input)
          return input
        },
      },
      // Lists follow the value.
      render(el, { api, subscribe }) {
        renderLists(el, api)
        return subscribe(() => renderLists(el, api))
      },
    },
    // Wraps your own <button>, so it keeps its native behavior.
    trigger: {
      tag: "ui-file-input-trigger",
      display: "contents",
      target: (el) =>
        el.querySelector<HTMLElement>("button") ??
        (el.firstElementChild as HTMLElement | null),
    },
    // `paste-target` is "document" or a CSS selector.
    dropzone: { tag: "ui-file-input-dropzone", display: "block" },
    list: { tag: "ui-file-input-list", display: "block" },
    item: {
      tag: "ui-file-input-item",
      display: "block",
      // Its value is its file's key.
      kinds: { value: null },
      context: (el) => {
        const file = (el as ItemElement).file
        return file ? { value: fileKey(file) } : {}
      },
    },
    "item-remove": {
      tag: "ui-file-input-item-remove",
      display: "contents",
      target: (el) =>
        el.querySelector<HTMLElement>("button") ??
        (el.firstElementChild as HTMLElement | null),
    },
  })
}

// The value each list last rendered.
const renderedValue = new WeakMap<Element, readonly File[]>()

// What an item shows about its file, by the `data-file` attribute's value.
const fileFields: Record<string, (file: File) => string> = {
  name: (file) => file.name,
  size: (file) => formatFileSize(file.size),
  type: (file) => file.type,
  path: (file) => relativePath(file),
}

// An item for a file: a copy of the list's template, or a plain item with the
// name and a remove button.
function createItem(list: Element, file: File) {
  const template = list.querySelector<HTMLTemplateElement>(":scope > template")
  const copy = template?.content.firstElementChild?.cloneNode(true) as
    ItemElement | undefined
  const item: ItemElement =
    copy?.localName === "ui-file-input-item"
      ? copy
      : element("ui-file-input-item")
  if (item !== copy) {
    item.append(element("span", { "data-file": "name" }))
    const remove = element("ui-file-input-item-remove")
    remove.append(element("button", { type: "button" }, "×"))
    item.append(remove)
  }
  // Set before the item upgrades, so its first props have the file.
  item.file = file
  for (const field of item.querySelectorAll<HTMLElement>("[data-file]")) {
    field.textContent = fileFields[field.dataset.file ?? ""]?.(file) ?? ""
  }
  return item
}

// One item per file in every list of the file input, kept by file, so focus
// on an item survives a neighbour's removal.
function renderLists(el: HTMLElement, api: FileInputApi) {
  const value = api.getValue()
  for (const list of el.querySelectorAll("ui-file-input-list")) {
    if (list.closest(owner) !== el || renderedValue.get(list) === value) {
      continue
    }
    renderedValue.set(list, value)
    const existing = new Map<File, ItemElement>()
    for (const item of list.querySelectorAll<ItemElement>(
      ":scope > ui-file-input-item"
    )) {
      if (item.file) {
        existing.set(item.file, item)
      }
    }
    for (const [file, item] of existing) {
      if (!value.includes(file)) {
        item.remove()
      }
    }
    // Items already in place stay put: moving a focused one would blur it.
    let previous = list.querySelector(":scope > template")
    for (const file of value) {
      const item = existing.get(file) ?? createItem(list, file)
      if (
        item.parentElement !== list ||
        item.previousElementSibling !== previous
      ) {
        if (previous) {
          previous.after(item)
        } else {
          list.prepend(item)
        }
      }
      previous = item
    }
  }
}

export { defineFileInputElements }
