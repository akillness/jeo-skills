import { render } from "svelte/server"
import { expect, test } from "vitest"
import App from "./apps/select-value-app.svelte"

test.each(["default", "children", "render"] as const)(
  "an external select value renders its %s content before its controller connects on the server",
  (content) => {
    const body = render(App, { props: { content } }).body
    expect(body).toContain("Pick a fruit")
    if (content === "default") {
      return
    }
    expect(body).toContain('data-value="null"')
    expect(body).toContain('data-count="0"')
    expect(body).toContain('data-placeholder="true"')
  }
)

test("an external select value keeps its static children on the server", () => {
  const body = render(App, { props: { content: "static" } }).body
  expect(body).toMatch(/id="value"[^>]*>(<!---->)?Fruit</)
})

test("a select value inside its root renders the selected label on the server", () => {
  const body = render(App, {
    props: { external: false, content: "render" },
  }).body
  expect(body).toContain('data-label="apple"')
  expect(body).toContain('data-count="1"')
  expect(body).toMatch(/<strong[^>]*>(<!---->)?Apple</)
})
