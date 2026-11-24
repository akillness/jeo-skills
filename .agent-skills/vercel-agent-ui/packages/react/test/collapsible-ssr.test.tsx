// @vitest-environment node
import { renderToString } from "react-dom/server"
import { describe, expect, test } from "vitest"
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "../src/collapsible"

// Runs with no DOM: any access to window or document during render throws.
describe("server rendering a collapsible", () => {
  test("renders an open panel with its content", () => {
    const html = renderToString(
      <Collapsible defaultOpen>
        <CollapsibleTrigger>Details</CollapsibleTrigger>
        <CollapsiblePanel>Panel</CollapsiblePanel>
      </Collapsible>
    )
    expect(typeof window).toBe("undefined")
    expect(html).toMatch(/aria-expanded="true"[^>]*data-open=""[^>]*>Details/)
    expect(html).toContain("Panel")
    expect(html).not.toMatch(/<div[^>]*hidden[^>]*>Panel/)
  })

  test("leaves a closed panel out, or renders it hidden when kept", () => {
    const closed = renderToString(
      <Collapsible>
        <CollapsibleTrigger>Details</CollapsibleTrigger>
        <CollapsiblePanel>Panel</CollapsiblePanel>
      </Collapsible>
    )
    expect(closed).not.toContain("Panel")
    const kept = renderToString(
      <Collapsible>
        <CollapsibleTrigger>Details</CollapsibleTrigger>
        <CollapsiblePanel keepMounted>Panel</CollapsiblePanel>
      </Collapsible>
    )
    expect(kept).toMatch(/<div[^>]*hidden=""[^>]*>Panel/)
  })

  test("renders a findable panel hidden, since React has no hidden until found on the server", () => {
    const html = renderToString(
      <Collapsible>
        <CollapsibleTrigger>Details</CollapsibleTrigger>
        <CollapsiblePanel hiddenUntilFound>Panel</CollapsiblePanel>
      </Collapsible>
    )
    expect(html).toMatch(/<div[^>]*hidden=""[^>]*>Panel/)
  })
})
