import { pagination, type PaginationRangeItem } from "@ui-sdk/core/pagination"
import { createParts, wrappedButton } from "./define-element"
import { element } from "./list"

const owner = "ui-pagination"

// <ui-pagination> is a navigation landmark around page links. Name it with
// `aria-label`. Links and steps wrap your own <button>, or an <a> with the
// `getHref` property. A list with a <template> renders the range from it,
// with a page number in each empty link, and a `<template data-ellipsis>` for
// the gaps. Markup:
//
// <ui-pagination page-count="10" aria-label="Pagination">
//   <ui-pagination-list>
//     <ui-pagination-item><ui-pagination-previous><button>Previous</button></ui-pagination-previous></ui-pagination-item>
//     <template><ui-pagination-item><ui-pagination-link><button></button></ui-pagination-link></ui-pagination-item></template>
//     <ui-pagination-item><ui-pagination-next><button>Next</button></ui-pagination-next></ui-pagination-item>
//   </ui-pagination-list>
// </ui-pagination>
//
// Links written out by hand, like a server's, take a `page` attribute.
function definePaginationElements() {
  createParts(pagination, {
    root: {
      tag: owner,
      display: "block",
      state: {
        page: {
          get: (api: { getPage: () => number }) => api.getPage(),
          set: (api: { setPage: (page: number) => boolean }, page: number) =>
            api.setPage(Number(page)),
        },
      },
      api: [
        "getPage",
        "getPageCount",
        "setPage",
        "next",
        "previous",
        "first",
        "last",
      ],
      // Lists follow the range.
      render(el, { api, subscribe }) {
        const render = () => renderLists(el, api)
        render()
        // Lists inside may upgrade after their pagination.
        queueMicrotask(render)
        return subscribe(render)
      },
    },
    list: { tag: "ui-pagination-list", display: "block" },
    item: { tag: "ui-pagination-item", display: "block" },
    link: {
      tag: "ui-pagination-link",
      display: "contents",
      target: wrappedButton,
    },
    previous: {
      tag: "ui-pagination-previous",
      display: "contents",
      target: wrappedButton,
    },
    next: {
      tag: "ui-pagination-next",
      display: "contents",
      target: wrappedButton,
    },
    first: {
      tag: "ui-pagination-first",
      display: "contents",
      target: wrappedButton,
    },
    last: {
      tag: "ui-pagination-last",
      display: "contents",
      target: wrappedButton,
    },
    ellipsis: { tag: "ui-pagination-ellipsis", display: "block" },
  })
}

// The range each list last rendered, and the item each generated element shows.
const renderedItems = new WeakMap<Element, PaginationRangeItem[]>()
const itemOf = new WeakMap<Element, PaginationRangeItem>()

// An entry for a page or a gap: a copy of the list's template, or a plain
// item for a gap when there's no `<template data-ellipsis>`.
function createEntry(list: Element, item: PaginationRangeItem) {
  const isPage = typeof item === "number"
  const template = list.querySelector<HTMLTemplateElement>(
    isPage
      ? ":scope > template:not([data-ellipsis])"
      : ":scope > template[data-ellipsis]"
  )
  const copy = template?.content.firstElementChild?.cloneNode(true) as
    HTMLElement | undefined
  if (!isPage) {
    if (copy) {
      return copy
    }
    const entry = element("ui-pagination-item")
    entry.append(element("ui-pagination-ellipsis", {}, "…"))
    return entry
  }
  if (!copy) {
    return undefined
  }
  const link =
    copy.localName === "ui-pagination-link"
      ? copy
      : copy.querySelector("ui-pagination-link")
  link?.setAttribute("page", String(item))
  const content = link && wrappedButton(link as HTMLElement)
  if (content && !content.textContent?.trim()) {
    content.textContent = String(item)
  }
  return copy
}

// One entry per item in every templated list, kept by item, so focus on a
// link survives the range moving around it.
function renderLists(
  el: HTMLElement,
  api: { internal: { items: () => PaginationRangeItem[] } }
) {
  const items = api.internal.items()
  for (const list of el.querySelectorAll("ui-pagination-list")) {
    const templates = list.querySelectorAll(":scope > template")
    if (
      list.closest(owner) !== el ||
      !templates.length ||
      renderedItems.get(list) === items
    ) {
      continue
    }
    renderedItems.set(list, items)
    const existing = new Map<PaginationRangeItem, Element>()
    for (const child of [...list.children]) {
      const item = itemOf.get(child)
      if (item === undefined) {
        continue
      }
      if (items.includes(item)) {
        existing.set(item, child)
      } else {
        child.remove()
      }
    }
    // Entries already in place stay put: moving a focused one would blur it.
    let previous: Element = templates[templates.length - 1]
    for (const item of items) {
      const entry = existing.get(item) ?? createEntry(list, item)
      if (!entry) {
        continue
      }
      itemOf.set(entry, item)
      if (previous.nextElementSibling !== entry) {
        previous.after(entry)
      }
      previous = entry
    }
  }
}

export { definePaginationElements }
