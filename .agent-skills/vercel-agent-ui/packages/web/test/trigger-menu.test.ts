// @vitest-environment jsdom
import { afterEach, expect, test } from "vitest"
import { defineTriggerMenuElements } from "../src/trigger-menu"

Element.prototype.getAnimations ??= () => []

const wait = () => new Promise((resolve) => setTimeout(resolve, 20))

afterEach(() => document.body.replaceChildren())

test("a content with a container stays the one content, and lists the data items", async () => {
  defineTriggerMenuElements()
  document.body.innerHTML = `
    <div id="box"></div>
    <ui-trigger-menu>
      <ui-trigger-menu-input><textarea aria-label="Message"></textarea></ui-trigger-menu-input>
      <ui-trigger-menu-content container="#box" keep-mounted>
        <ui-trigger-menu-list></ui-trigger-menu-list>
      </ui-trigger-menu-content>
    </ui-trigger-menu>`
  const menu = document.querySelector("ui-trigger-menu")!
  await wait()
  menu.triggers = [{ char: "@", items: [{ value: "ada", label: "Ada" }] }]
  await wait()
  void menu.api.open({ trigger: "@" })
  await wait()
  const contents = document.querySelectorAll("ui-trigger-menu-content")
  expect(contents).toHaveLength(1)
  expect(contents[0].parentElement?.id).toBe("box")
  expect(contents[0].getAttribute("data-open")).not.toBeNull()
  expect(contents[0].style.position).toBe("fixed")
  expect(
    [...contents[0].querySelectorAll("ui-trigger-menu-item")].map(
      (item) => item.textContent
    )
  ).toEqual(["Ada"])
})
