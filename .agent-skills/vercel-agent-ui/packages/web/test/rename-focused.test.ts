// @vitest-environment jsdom
// A focused tab whose value changes keeps the tab stop, as the tabs pattern
// puts it on the selected tab.
import { beforeAll, expect, test } from "vitest"
import { defineTabsElements } from "../src/tabs"

const wait = () => new Promise((resolve) => setTimeout(resolve, 20))

beforeAll(() => {
  ;(
    Element.prototype as { getAnimations?: () => Animation[] }
  ).getAnimations ??= () => []
  defineTabsElements()
})

test("the selected tab keeps the tab stop when its value changes while it has focus", async () => {
  document.body.innerHTML = `<ui-tabs value="b"><ui-tabs-list aria-label="Settings"><ui-tabs-tab value="a"><button>A</button></ui-tabs-tab><ui-tabs-tab value="b"><button>B</button></ui-tabs-tab><ui-tabs-tab value="c"><button>C</button></ui-tabs-tab></ui-tabs-list><ui-tabs-panel value="b">B</ui-tabs-panel></ui-tabs>`
  await wait()
  const buttons = [...document.querySelectorAll("button")]
  buttons[1].focus()
  document.querySelectorAll("ui-tabs-tab")[1].setAttribute("value", "b2")
  document.querySelector("ui-tabs-panel")!.setAttribute("value", "b2")
  document.querySelector("ui-tabs")!.setAttribute("value", "b2")
  await wait()
  expect(document.activeElement).toBe(buttons[1])
  expect(buttons[1].getAttribute("aria-selected")).toBe("true")
  expect(buttons.map((button) => button.tabIndex)).toEqual([-1, 0, -1])
})
