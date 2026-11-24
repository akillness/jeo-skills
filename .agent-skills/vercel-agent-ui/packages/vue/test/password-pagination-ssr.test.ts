// @vitest-environment node
import { renderToString } from "@vue/server-renderer"
import { describe, expect, test } from "vitest"
import { createSSRApp, h } from "vue"
import {
  Pagination,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationList,
  PaginationNext,
  PasswordInput,
  PasswordInputControl,
  PasswordInputToggle,
  type PaginationState,
} from "../src"

const password = (defaultVisible?: boolean) =>
  createSSRApp(() =>
    h(PasswordInput, { name: "password", defaultVisible }, () => [
      h(PasswordInputControl, { "aria-label": "Password" }),
      h(PasswordInputToggle, { "aria-label": "Show password" }),
    ])
  )

const pages = (getHref?: (page: number) => string) =>
  createSSRApp(() =>
    h(
      Pagination,
      { "aria-label": "Pages", pageCount: 10, defaultPage: 5, getHref },
      () =>
        h(PaginationList, null, {
          default: ({ state }: { state: PaginationState }) => [
            ...state.items.map((item) =>
              h(PaginationItem, { key: item }, () =>
                typeof item === "number"
                  ? h(PaginationLink, { page: item })
                  : h(PaginationEllipsis)
              )
            ),
            h(PaginationItem, () => h(PaginationNext, () => "Next")),
          ],
        })
    )
  )

// Runs with no DOM: any access to window or document during render throws.
describe("password input server rendering", () => {
  test("the server renders a password field with its form attributes and a toggle button", async () => {
    const html = await renderToString(password())
    expect(html).toContain('type="password"')
    expect(html).toContain('name="password"')
    expect(html).toContain('autocomplete="current-password"')
    expect(html).toMatch(/<button[^>]*type="button"[^>]*aria-pressed="false"/)
  })

  test("a password shown from the start renders as a text field", async () => {
    expect(await renderToString(password(true))).toContain('type="text"')
  })
})

describe("pagination server rendering", () => {
  test("the server renders the landmark, the range and the current page", async () => {
    const html = await renderToString(pages())
    expect(html).toMatch(/<nav[^>]*aria-label="Pages"/)
    expect(html).toMatch(/aria-current="page"[^>]*>5</)
  })

  test("with getHref the server renders links", async () => {
    const html = await renderToString(pages((page) => `/results?page=${page}`))
    expect(html).toContain('href="/results?page=6"')
  })
})
