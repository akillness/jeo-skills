import { render } from "@solidjs/web"
import { createSignal, flush, For } from "solid-js"
import { afterEach, expect, test } from "vitest"
import {
  Pagination,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationList,
  paginationRange,
  type PaginationRangeItem,
} from "../src/pagination"

let dispose = () => {}

function mount(code: () => any) {
  const root = document.createElement("div")
  document.body.append(root)
  dispose = render(code, root)
  flush()
  return root
}

afterEach(() => {
  dispose()
  document.body.replaceChildren()
})

const linkFor = (root: HTMLElement, page: number) =>
  [...root.querySelectorAll("button")].find(
    (button) => button.textContent === String(page)
  )

const range = (items: readonly PaginationRangeItem[]) => (
  <For each={items}>
    {(item) => (
      <PaginationItem>
        {typeof item === "number" ? (
          <PaginationLink page={item} />
        ) : (
          <PaginationEllipsis />
        )}
      </PaginationItem>
    )}
  </For>
)

test("a page change hands the list's children the new page with its own range, in one pass", () => {
  const [page, setPage] = createSignal(1)
  const renders: string[] = []
  mount(() => (
    <Pagination aria-label="Pages" page={page()} pageCount={20}>
      <PaginationList>
        {(state) => {
          renders.push(`${state.page}: ${state.items.join(" ")}`)
          return range(state.items)
        }}
      </PaginationList>
    </Pagination>
  ))
  renders.length = 0
  setPage(10)
  flush()
  expect(renders).toEqual([
    `10: ${paginationRange({ page: 10, pageCount: 20 }).join(" ")}`,
  ])
})

test("the links that stay in the range keep their elements as the page changes", () => {
  const [page, setPage] = createSignal(1)
  const root = mount(() => (
    <Pagination aria-label="Pages" page={page()} pageCount={20}>
      <PaginationList>{(state) => range(state.items)}</PaginationList>
    </Pagination>
  ))
  const lastLink = linkFor(root, 20)
  expect(lastLink).toBeDefined()
  setPage(10)
  flush()
  expect(linkFor(root, 10)?.getAttribute("aria-current")).toBe("page")
  expect(linkFor(root, 20)).toBe(lastLink)
})

test("a getHref that reads a signal moves the links when the signal changes", () => {
  const [filter, setFilter] = createSignal("open")
  const root = mount(() => (
    <Pagination
      aria-label="Pages"
      page={1}
      pageCount={3}
      getHref={(page) => `/?status=${filter()}&page=${page}`}
    >
      <PaginationList>{(state) => range(state.items)}</PaginationList>
    </Pagination>
  ))
  const hrefOf = (page: number) =>
    [...root.querySelectorAll("a")]
      .find((link) => link.textContent === String(page))
      ?.getAttribute("href")
  expect(hrefOf(2)).toBe("/?status=open&page=2")
  setFilter("done")
  flush()
  expect(hrefOf(2)).toBe("/?status=done&page=2")
})
