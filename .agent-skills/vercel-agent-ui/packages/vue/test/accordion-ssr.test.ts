// @vitest-environment node
import { renderToString } from "@vue/server-renderer"
import { describe, expect, test } from "vitest"
import { createSSRApp, h } from "vue"
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "../src"

const items = (keepMounted?: boolean) =>
  ["a", "b"].map((value) =>
    h(AccordionItem, { key: value, value }, () => [
      h(AccordionHeader, null, () =>
        h(AccordionTrigger, null, () => `Trigger ${value}`)
      ),
      h(AccordionPanel, { keepMounted }, () => `Panel ${value}`),
    ])
  )

// Runs with no DOM: any access to window or document during render throws.
describe("server rendering an accordion", () => {
  test("renders open panels with their content and leaves closed ones out", async () => {
    const html = await renderToString(
      createSSRApp(() => h(Accordion, { defaultValue: ["b"] }, () => items()))
    )
    expect(typeof window).toBe("undefined")
    expect(html).toContain("<h3")
    expect(html).toMatch(/aria-expanded="true"[^>]*>Trigger b/)
    expect(html).toMatch(/aria-expanded="false"[^>]*>Trigger a/)
    expect(html).toContain("Panel b")
    expect(html).not.toContain("Panel a")
  })

  test("kept panels render hidden", async () => {
    const html = await renderToString(
      createSSRApp(() =>
        h(Accordion, { defaultValue: ["b"] }, () => items(true))
      )
    )
    expect(html).toMatch(/<div[^>]*hidden[^>]*>Panel a/)
  })

  test("findable panels render hidden until found, so find in page works before hydration", async () => {
    const html = await renderToString(
      createSSRApp(() =>
        h(Accordion, { defaultValue: ["b"], hiddenUntilFound: true }, () =>
          items()
        )
      )
    )
    expect(html).toMatch(/<div[^>]*hidden="until-found"[^>]*>Panel a/)
  })
})
