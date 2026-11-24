// @vitest-environment jsdom
// The agent names a component by its label, like React's does, though the
// web adapter keys every part by its element.
import { beforeAll, expect, test } from "vitest"
import { createAgent } from "../src/agent"
import { defineComboboxElements } from "../src/combobox"
import { defineDialogElements } from "../src/dialog"
import { defineTabsElements } from "../src/tabs"

const wait = () => new Promise((resolve) => setTimeout(resolve, 10))

beforeAll(() => {
  ;(
    Element.prototype as { getAnimations?: () => Animation[] }
  ).getAnimations ??= () => []
  ElementInternals.prototype.setFormValue ??= () => {}
  ElementInternals.prototype.setValidity ??= () => {}
  defineComboboxElements()
  defineTabsElements()
  defineDialogElements()
})

test("a combobox is named by its label, not by its trigger", async () => {
  const agent = createAgent()
  document.body.innerHTML = `
    <ui-combobox>
      <ui-combobox-label>Assignee</ui-combobox-label>
      <ui-combobox-input><input placeholder="Nobody" /></ui-combobox-input>
      <ui-combobox-trigger><button aria-label="Show people">⌄</button></ui-combobox-trigger>
      <ui-combobox-content>
        <ui-combobox-list><ui-combobox-item value="ann">Ann</ui-combobox-item></ui-combobox-list>
      </ui-combobox-content>
    </ui-combobox>`
  await wait()
  expect(agent.snapshot()).toEqual([
    expect.objectContaining({ component: "combobox", label: "Assignee" }),
  ])
})

test("tabs are named by their list, like React's", async () => {
  const agent = createAgent()
  document.body.innerHTML = `
    <ui-tabs default-value="profile">
      <ui-tabs-list aria-label="Settings">
        <ui-tabs-tab value="profile"><button type="button">Profile</button></ui-tabs-tab>
        <ui-tabs-tab value="billing"><button type="button">Billing</button></ui-tabs-tab>
      </ui-tabs-list>
      <ui-tabs-panel value="profile">Profile settings</ui-tabs-panel>
      <ui-tabs-panel value="billing">Billing settings</ui-tabs-panel>
    </ui-tabs>`
  await wait()
  expect(agent.snapshot()).toContainEqual(
    expect.objectContaining({ component: "tabs", label: "Settings" })
  )
  const result = await agent.act({
    steps: [{ ref: "Settings", action: "setValue", args: ["billing"] }],
  })
  expect(result.ok).toBe(true)
})

test("a closed dialog isn't named by a button inside its hidden content", async () => {
  const agent = createAgent()
  document.body.innerHTML = `
    <ui-dialog>
      <ui-dialog-trigger><button><svg aria-hidden="true"></svg></button></ui-dialog-trigger>
      <ui-dialog-content>
        <ui-dialog-close><button>Done</button></ui-dialog-close>
      </ui-dialog-content>
    </ui-dialog>`
  await wait()
  const dialog = agent
    .snapshot()
    .find((component) => component.component === "dialog" && !component.offPage)
  expect(dialog).toBeDefined()
  expect(dialog?.label).toBeUndefined()
})
