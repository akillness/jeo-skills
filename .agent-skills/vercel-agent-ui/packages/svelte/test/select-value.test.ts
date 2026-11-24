import { flushSync, mount, unmount, type ComponentProps } from "svelte"
import { afterEach, expect, test } from "vitest"
import App from "./apps/select-value-app.svelte"

let app: ReturnType<typeof mount> | undefined

afterEach(async () => {
  if (app) {
    await unmount(app)
  }
  app = undefined
  document.body.replaceChildren()
})

function render(props: ComponentProps<typeof App>) {
  const target = document.body.appendChild(document.createElement("div"))
  const current = mount(App, { target, props })
  app = current
  flushSync()
  return { target, current }
}

test.each(["default", "children", "render"] as const)(
  "an external select value renders its %s content before connection and follows its selected value",
  (content) => {
    const { target, current } = render({ content, connected: false })
    expect(target.querySelector("#value")!.textContent).toBe("Pick a fruit")
    if (content !== "default") {
      const state = target.querySelector("[data-count]")!
      expect(state.getAttribute("data-value")).toBe("null")
      expect(state.getAttribute("data-count")).toBe("0")
      expect(state.getAttribute("data-placeholder")).toBe("true")
    }

    flushSync(() => current.changePlaceholder())
    expect(target.querySelector("#value")!.textContent).toBe("Choose a fruit")
    flushSync(() => current.attach())
    expect(target.querySelector("#value")!.textContent).toBe(
      content === "children" ? "apple" : "Apple"
    )
    flushSync(() => current.choosePear())
    expect(target.querySelector("#value")!.textContent).toBe(
      content === "children" ? "pear" : "Pear"
    )
    if (content !== "default") {
      const state = target.querySelector("[data-count]")!
      expect(state.getAttribute("data-value")).toBe('"pear"')
      expect(state.getAttribute("data-count")).toBe("1")
      expect(state.getAttribute("data-placeholder")).toBe("false")
    }
  }
)

test("an external select value keeps static children when its controller connects", () => {
  const { target } = render({ content: "static" })
  expect(target.querySelector("#value")!.textContent).toBe("Fruit")
})

test("a select value inside its root follows the selected value", () => {
  const { target, current } = render({ external: false, content: "render" })
  expect(target.querySelector("#value")!.textContent).toBe("Apple")
  flushSync(() => current.choosePear())
  expect(target.querySelector("#value")!.textContent).toBe("Pear")
})
