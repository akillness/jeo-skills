// @vitest-environment node
import { renderToString } from "react-dom/server"
import { describe, expect, test } from "vitest"
import {
  Pagination,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationList,
  PaginationNext,
  PaginationPrevious,
} from "../src/pagination"
import {
  PasswordInput,
  PasswordInputControl,
  PasswordInputToggle,
} from "../src/password-input"

function Password({ defaultVisible }: { defaultVisible?: boolean }) {
  return (
    <PasswordInput name="password" required defaultVisible={defaultVisible}>
      <PasswordInputControl aria-label="Password" />
      <PasswordInputToggle aria-label="Show password" />
    </PasswordInput>
  )
}

function Pages({ getHref }: { getHref?: (page: number) => string }) {
  return (
    <Pagination
      aria-label="Pages"
      pageCount={10}
      defaultPage={5}
      getHref={getHref}
    >
      <PaginationList>
        {({ items }) => (
          <>
            <PaginationItem>
              <PaginationPrevious>Previous</PaginationPrevious>
            </PaginationItem>
            {items.map((item) => (
              <PaginationItem key={item}>
                {typeof item === "number" ? (
                  <PaginationLink page={item} />
                ) : (
                  <PaginationEllipsis />
                )}
              </PaginationItem>
            ))}
            <PaginationItem>
              <PaginationNext>Next</PaginationNext>
            </PaginationItem>
          </>
        )}
      </PaginationList>
    </Pagination>
  )
}

// Runs with no DOM: any access to window or document during render throws.
describe("password input server rendering", () => {
  test("the server renders a password field with its form attributes and a toggle button", () => {
    const html = renderToString(<Password />)
    expect(html).toContain('type="password"')
    expect(html).toContain('name="password"')
    expect(html).toContain('autoComplete="current-password"')
    expect(html).toContain('spellCheck="false"')
    expect(html).toMatch(/<button[^>]*type="button"[^>]*aria-pressed="false"/)
  })

  test("a password shown from the start renders as a text field", () => {
    const html = renderToString(<Password defaultVisible />)
    expect(html).toContain('type="text"')
    expect(html).toContain('aria-pressed="true"')
  })
})

describe("pagination server rendering", () => {
  test("the server renders the landmark, the range and the current page", () => {
    const html = renderToString(<Pages />)
    expect(html).toMatch(/<nav[^>]*aria-label="Pages"/)
    expect(html).toContain('role="list"')
    expect(html).toMatch(/aria-current="page"[^>]*>5</)
    expect(html.match(/aria-hidden="true"[^>]*>…/g)).toHaveLength(2)
  })

  test("with getHref the server renders links that work before hydration", () => {
    const html = renderToString(
      <Pages getHref={(page) => `/results?page=${page}`} />
    )
    expect(html).toContain('href="/results?page=4"')
    expect(html).toContain('href="/results?page=6"')
    expect(html).not.toContain('type="button"')
  })
})
