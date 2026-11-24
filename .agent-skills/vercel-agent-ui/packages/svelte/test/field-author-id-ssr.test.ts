// In server HTML, a number input's control in a Field keeps the id its author
// gives it, and the step button rendered after it points at that id.
import { render } from "svelte/server"
import { expect, test } from "vitest"
import App from "./apps/field-author-id-app.svelte"

const tags = (html: string) => html.match(/<[a-z][^>]*>/g) ?? []
const attribute = (tag: string | undefined, name: string) =>
  tag?.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1]

test("a number input's control in a field renders the id passed to it, and the button after it points at it", () => {
  const html = tags(render(App, { props: { kind: "number-input" } }).body)
  expect(
    attribute(
      html.find(
        (tag) => tag.startsWith("<input") && !tag.includes('type="hidden"')
      ),
      "id"
    )
  ).toBe("mine")
  expect(
    attribute(
      html.filter((tag) => tag.startsWith("<button")).at(-1),
      "aria-controls"
    )
  ).toBe("mine")
})
