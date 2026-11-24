// @vitest-environment jsdom
// Typing into a command with `items` filters the elements it rendered: the
// ones that still match stay, rather than every one being made again.
import { beforeAll, expect, test } from "vitest"
import { defineCommandElements } from "../src/command"

const wait = () => new Promise((resolve) => setTimeout(resolve, 10))

beforeAll(() => {
  ;(
    Element.prototype as { getAnimations?: () => Animation[] }
  ).getAnimations ??= () => []
  defineCommandElements()
})

test("filtering keeps the elements of items that still match, in order", async () => {
  document.body.innerHTML = `
    <ui-command>
      <ui-command-input><input aria-label="Search" /></ui-command-input>
      <ui-command-list></ui-command-list>
    </ui-command>`
  const command = document.querySelector("ui-command") as HTMLElement & {
    items: string[]
  }
  command.items = ["Apple", "Apricot", "Banana"]
  await wait()
  const rendered = () =>
    Array.from(document.querySelectorAll("ui-command-item"))
  const [apple, apricot] = rendered()
  const input = document.querySelector("input")!
  input.value = "ap"
  input.dispatchEvent(new InputEvent("input", { bubbles: true }))
  await wait()
  expect(rendered()).toHaveLength(2)
  expect(rendered()[0]).toBe(apple)
  expect(rendered()[1]).toBe(apricot)
  input.value = ""
  input.dispatchEvent(new InputEvent("input", { bubbles: true }))
  await wait()
  expect(rendered()[0]).toBe(apple)
  expect(rendered()[1]).toBe(apricot)
  expect(rendered().map((item) => item.getAttribute("value"))).toEqual([
    "Apple",
    "Apricot",
    "Banana",
  ])
})
