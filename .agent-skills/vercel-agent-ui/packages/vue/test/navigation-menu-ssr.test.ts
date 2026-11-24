// @vitest-environment node
import { renderToString } from "@vue/server-renderer"
import { describe, expect, test } from "vitest"
import { createSSRApp, h } from "vue"
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  NavigationMenuViewport,
} from "../src"

const menu = (props: { defaultValue?: string; keepMounted?: boolean } = {}) =>
  createSSRApp(() =>
    h(
      NavigationMenu,
      { "aria-label": "Main", defaultValue: props.defaultValue },
      () => [
        h(NavigationMenuList, () => [
          h(NavigationMenuItem, { value: "products" }, () => [
            h(NavigationMenuTrigger, () => "Products"),
            h(NavigationMenuContent, { keepMounted: props.keepMounted }, () => [
              h(NavigationMenuLink, { href: "/analytics" }, () => "Analytics"),
            ]),
          ]),
          h(NavigationMenuItem, () => [
            h(
              NavigationMenuLink,
              { href: "/pricing", current: true },
              () => "Pricing"
            ),
          ]),
        ]),
        h(NavigationMenuViewport),
      ]
    )
  )

// Runs with no DOM: any access to window or document during render throws.
describe("server rendering a navigation menu", () => {
  test("a closed menu is a navigation landmark with collapsed buttons and the current link", async () => {
    const html = await renderToString(menu())
    expect(typeof window).toBe("undefined")
    expect(html).toMatch(/^<nav[^>]*aria-label="Main"/)
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('aria-current="page"')
    expect(html).not.toContain("Analytics")
  })

  test("an open menu renders its panel in place, shown", async () => {
    const html = await renderToString(menu({ defaultValue: "products" }))
    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain("Analytics")
  })

  test("a closed panel kept mounted is in the HTML, hidden", async () => {
    const html = await renderToString(menu({ keepMounted: true }))
    expect(html).toContain("Analytics")
    expect(html).toMatch(/data-slot="navigation-menu-content"[^>]*hidden/)
  })
})
