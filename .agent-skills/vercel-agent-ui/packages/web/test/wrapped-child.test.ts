// @vitest-environment jsdom
// A part binds the native element inside it. One the app takes out lets go of
// the part, wherever it goes, and one put in its place takes it.
import { expect, test } from "vitest"
import { defineTabsElements } from "../src/tabs"

const wait = () => new Promise((resolve) => setTimeout(resolve, 10))

test("a tab's button moved away or removed stops selecting it, and one put in its place does", async () => {
  ;(
    Element.prototype as { getAnimations?: () => Animation[] }
  ).getAnimations ??= () => []
  defineTabsElements()
  document.body.innerHTML = `<ui-tabs value="a"><ui-tabs-list aria-label="Settings"><ui-tabs-tab value="a"><button>Alpha</button></ui-tabs-tab><ui-tabs-tab value="b"><button>Beta</button></ui-tabs-tab></ui-tabs-list><ui-tabs-panel value="a">A</ui-tabs-panel><ui-tabs-panel value="b">B</ui-tabs-panel></ui-tabs>`
  await wait()
  const tabs = document.querySelector("ui-tabs") as HTMLElement & {
    value: string
  }
  const tab = document.querySelector('ui-tabs-tab[value="b"]')!
  const old = tab.querySelector("button")!
  const replacement = document.createElement("button")
  document.body.append(old)
  tab.append(replacement)
  await wait()
  old.click()
  await wait()
  expect(tabs.value).toBe("a")
  expect(replacement.getAttribute("role")).toBe("tab")
  replacement.click()
  await wait()
  expect(tabs.value).toBe("b")

  tabs.value = "a"
  replacement.remove()
  await wait()
  replacement.click()
  await wait()
  expect(tabs.value).toBe("a")
})
