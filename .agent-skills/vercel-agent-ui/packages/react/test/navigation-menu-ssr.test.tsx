// @vitest-environment node
import { renderToString } from "react-dom/server"
import { describe, expect, test } from "vitest"
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuIndicator,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  NavigationMenuViewport,
} from "../src/navigation-menu"

function Menu({
  defaultValue,
  keepMounted,
}: {
  defaultValue?: string
  keepMounted?: boolean
}) {
  return (
    <NavigationMenu aria-label="Main" defaultValue={defaultValue}>
      <NavigationMenuList>
        <NavigationMenuItem value="products">
          <NavigationMenuTrigger>Products</NavigationMenuTrigger>
          <NavigationMenuContent keepMounted={keepMounted}>
            <NavigationMenuLink href="/analytics">Analytics</NavigationMenuLink>
          </NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuLink href="/pricing" current>
            Pricing
          </NavigationMenuLink>
        </NavigationMenuItem>
      </NavigationMenuList>
      <NavigationMenuIndicator />
      <NavigationMenuViewport />
    </NavigationMenu>
  )
}

// Runs with no DOM: any access to window or document during render throws.
describe("navigation menu server rendering", () => {
  test("a closed menu is a navigation landmark with collapsed buttons and the current link", () => {
    const html = renderToString(<Menu />)
    expect(typeof window).toBe("undefined")
    expect(html).toMatch(/^<nav aria-label="Main"/)
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('aria-current="page"')
    expect(html).not.toContain("Analytics")
  })

  test("an open menu renders its panel in place, shown", () => {
    const html = renderToString(<Menu defaultValue="products" />)
    expect(html).toContain('aria-expanded="true"')
    expect(html).toMatch(/aria-controls="[^"]+-content-products"/)
    expect(html).toContain("Analytics")
    expect(html).not.toMatch(/data-slot="navigation-menu-content"[^>]*hidden/)
  })

  test("a closed panel kept mounted is in the HTML, hidden", () => {
    const html = renderToString(<Menu keepMounted />)
    expect(html).toContain("Analytics")
    expect(html).toMatch(/data-slot="navigation-menu-content"[^>]*hidden/)
  })
})
