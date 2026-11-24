// @vitest-environment node
import { renderToString } from "react-dom/server"
import { describe, expect, test } from "vitest"
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "../src/accordion"

function Items({ keepMounted }: { keepMounted?: boolean }) {
  return ["a", "b"].map((value) => (
    <AccordionItem key={value} value={value}>
      <AccordionHeader>
        <AccordionTrigger>{`Trigger ${value}`}</AccordionTrigger>
      </AccordionHeader>
      <AccordionPanel
        keepMounted={keepMounted}
      >{`Panel ${value}`}</AccordionPanel>
    </AccordionItem>
  ))
}

// Runs with no DOM: any access to window or document during render throws.
describe("server rendering an accordion", () => {
  test("renders open panels with their content and leaves closed ones out", () => {
    const html = renderToString(
      <Accordion defaultValue={["b"]}>
        <Items />
      </Accordion>
    )
    expect(typeof window).toBe("undefined")
    expect(html).toContain("<h3")
    expect(html).toMatch(/aria-expanded="true"[^>]*>Trigger b/)
    expect(html).toMatch(/aria-expanded="false"[^>]*>Trigger a/)
    expect(html).toContain('role="region"')
    expect(html).toContain("Panel b")
    expect(html).not.toContain("Panel a")
  })

  test("kept and findable panels render hidden", () => {
    const kept = renderToString(
      <Accordion defaultValue={["b"]}>
        <Items keepMounted />
      </Accordion>
    )
    expect(kept).toMatch(/<div[^>]*hidden=""[^>]*>Panel a/)
    const findable = renderToString(
      <Accordion defaultValue={["b"]} hiddenUntilFound>
        <Items />
      </Accordion>
    )
    // React can only render hidden as a boolean. The panel makes it until-found once bound.
    expect(findable).toMatch(/<div[^>]*hidden=""[^>]*>Panel a/)
    expect(findable).toMatch(/<div(?![^>]*hidden)[^>]*>Panel b/)
  })
})
