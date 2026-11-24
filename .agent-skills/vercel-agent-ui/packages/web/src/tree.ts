import { tree, type TreeApi, type TreeItemData } from "@ui-sdk/core/tree"
import { createParts } from "./define-element"
import { copy, element, listAttribute, templateOf } from "./list"

const owner = "ui-tree"

// The properties rich values are set through.
type TreeElement = HTMLElement & {
  items?: TreeItemData[]
  paths?: string[]
}

// The items a data tree rendered for itself, so new items replace them.
const generated = new WeakMap<HTMLElement, HTMLElement[]>()

// check-code: allow return-type recursive, so TypeScript cannot infer it.
function renderItems(
  items: TreeItemData[],
  checkable: boolean,
  template: HTMLTemplateElement | null
): HTMLElement[] {
  return items.map((item) => {
    const el = copy(template, "ui-tree-item", false)
    el.setAttribute("value", item.value)
    if (item.children !== undefined) {
      el.setAttribute("branch", "")
    }
    if (item.disabled) {
      el.setAttribute("disabled", "")
    }
    // Parts copied from the template's item, like its indicator, only where they apply.
    if (item.children) {
      el.append(copy(template, "ui-tree-item-indicator"))
    }
    if (checkable) {
      el.append(copy(template, "ui-tree-item-checkbox"))
    }
    const label = copy(template, "ui-tree-item-label")
    if (item.href) {
      // The link is the label, so it takes the label's classes.
      const link = element(
        "a",
        { href: item.href, class: label.getAttribute("class") ?? undefined },
        item.label
      )
      label.removeAttribute("class")
      label.setAttribute("as-child", "")
      label.replaceChildren(link)
    } else {
      label.textContent = item.label
    }
    el.append(label)
    if (item.children) {
      const group = copy(template, "ui-tree-group", false)
      group.append(...renderItems(item.children, checkable, template))
      el.append(group)
    }
    return el
  })
}

// Set `items` or `paths` and the element renders its items, from a <template>
// inside it when it has one. With `mode="multiple"`, `value` lists values
// separated by commas.
function defineTreeElements() {
  createParts(tree, {
    root: {
      tag: owner,
      defaults: { expandOnPress: true, focusableWhenDisabled: true },
      display: "block",
      // `action` listeners call `event.detail.waitUntil(promise)` to mark the item pending.
      options: (el) => {
        const data = el as TreeElement
        const multiple = el.getAttribute("mode") === "multiple"
        const start =
          el.getAttribute("default-value") ?? el.getAttribute("value")
        return {
          items: data.items,
          paths: data.paths,
          ...(start !== null && {
            defaultValue: multiple ? listAttribute(start) : start,
          }),
        }
      },
      state: {
        value: {
          get: (api: TreeApi) => api.getValue(),
          // A string lists values separated by commas with multiple selection.
          set: (api: TreeApi, value: string | string[] | null) => {
            const multiple = api.internal.mode() === "multiple"
            if (typeof value === "string") {
              return api.setValue(
                multiple ? listAttribute(value) : value || null
              )
            }
            api.setValue(value ?? (multiple ? [] : null))
          },
        },
        expanded: {
          get: (api: TreeApi) => api.getExpanded(),
          set: (api: TreeApi, value: string | string[] | null) =>
            api.setExpanded(
              typeof value === "string" ? listAttribute(value) : (value ?? [])
            ),
        },
        checked: {
          get: (api: TreeApi) => api.getChecked(),
          set: (api: TreeApi, value: string | string[] | null) =>
            api.setChecked(
              typeof value === "string" ? listAttribute(value) : (value ?? [])
            ),
        },
      },
      api: [
        "getExpanded",
        "setExpanded",
        "isExpanded",
        "expand",
        "collapse",
        "toggle",
        "expandAll",
        "collapseAll",
        "getValue",
        "setValue",
        "getChecked",
        "setChecked",
        "checkedState",
        "reveal",
        "focus",
      ],
      // Runs again whenever `items` or `paths` is set.
      render(el, { api }) {
        const focused = el.ownerDocument.activeElement?.closest("ui-tree-item")
        const keep =
          focused && el.contains(focused) ? focused.getAttribute("value") : null
        generated.get(el)?.forEach((child) => child.remove())
        generated.delete(el)
        // Items of its own, like rows a virtualized list renders, win over the data.
        if (el.querySelector(":scope > ui-tree-item")) {
          return
        }
        const items = api.internal.items()
        if (!items) {
          return
        }
        const fresh = renderItems(
          items,
          el.hasAttribute("checkable"),
          templateOf(el)
        )
        generated.set(el, fresh)
        el.append(...fresh)
        // Focus stays on the item that had it, now a new element.
        if (keep !== null) {
          api.focus(keep)
        }
      },
    },
    // An item's parent is the item around it, and a group inside it makes it a branch.
    item: {
      tag: "ui-tree-item",
      display: "block",
      context: (el) =>
        el.querySelector(":scope > ui-tree-group") ? { branch: true } : {},
    },
    label: "ui-tree-item-label",
    indicator: "ui-tree-item-indicator",
    checkbox: "ui-tree-item-checkbox",
    group: { tag: "ui-tree-group", display: "block" },
  })
}

export { defineTreeElements }
