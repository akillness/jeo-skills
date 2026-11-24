// @vitest-environment jsdom
import { beforeAll, expect, test, vi } from "vitest"
import { createAgent } from "../src/agent"
import { defineButtonElements } from "../src/button"
import { defineDialogElements } from "../src/dialog"

const wait = () => new Promise((resolve) => setTimeout(resolve, 10))

beforeAll(() => {
  ;(
    Element.prototype as { getAnimations?: () => Animation[] }
  ).getAnimations ??= () => []
  defineButtonElements()
  defineDialogElements()
})

test("a press by label on a ui-button inside a dialog trigger presses it", async () => {
  const agent = createAgent()
  document.body.innerHTML = `
    <ui-dialog>
      <ui-dialog-trigger><ui-button><button>Delete project</button></ui-button></ui-dialog-trigger>
      <ui-dialog-content><ui-dialog-title>Delete project?</ui-dialog-title></ui-dialog-content>
    </ui-dialog>`
  await wait()
  const button = document.querySelector("button")!
  expect(button.getAttribute("aria-haspopup")).toBe("dialog")
  const clicked = vi.fn()
  button.addEventListener("click", clicked)
  const outcome = await agent.act({
    steps: [{ ref: "Delete project", action: "press" }],
  })
  expect(outcome.ok, outcome.error?.message).toBe(true)
  expect(clicked).toHaveBeenCalledTimes(1)
})
