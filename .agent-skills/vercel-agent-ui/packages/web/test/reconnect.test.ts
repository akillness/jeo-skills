// @vitest-environment jsdom
// An element removed and put back later, like a view a router keeps, works
// again where it was, and the agent sees it again.
import { expect, test } from "vitest"
import { createAgent } from "../src/agent"
import { defineTabsElements } from "../src/tabs"

const wait = () => new Promise((resolve) => setTimeout(resolve, 10))

test("tabs put back on the page keep their tab and reach the agent", async () => {
  ;(
    Element.prototype as { getAnimations?: () => Animation[] }
  ).getAnimations ??= () => []
  const agent = createAgent()
  defineTabsElements()
  document.body.innerHTML = `<div id="host"><ui-tabs value="a"><ui-tabs-list aria-label="Settings"><ui-tabs-tab value="a"><button>Alpha</button></ui-tabs-tab><ui-tabs-tab value="b"><button>Beta</button></ui-tabs-tab></ui-tabs-list><ui-tabs-panel value="a">A</ui-tabs-panel><ui-tabs-panel value="b">B</ui-tabs-panel></ui-tabs></div>`
  await wait()
  const tabs = document.querySelector("ui-tabs") as HTMLElement & {
    value: string
  }
  document.querySelectorAll("button")[1].click()
  await wait()
  expect(tabs.value).toBe("b")
  tabs.remove()
  await wait()
  document.getElementById("host")!.append(tabs)
  await wait()
  expect(tabs.value).toBe("b")
  expect(agent.snapshot()).toEqual([
    expect.objectContaining({
      component: "tabs",
      value: "b",
      actions: ["setValue"],
    }),
  ])
  const [{ ref }] = agent.snapshot()
  expect(
    await agent.act({ steps: [{ ref, action: "setValue", args: ["Alpha"] }] })
  ).toMatchObject({
    ok: true,
  })
  expect(tabs.value).toBe("a")
  expect(
    document.querySelectorAll("button")[0].getAttribute("aria-selected")
  ).toBe("true")
})
