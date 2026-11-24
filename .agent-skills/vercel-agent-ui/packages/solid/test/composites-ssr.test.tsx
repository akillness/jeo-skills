import { renderToString } from "@solidjs/web"
import { describe, expect, test } from "vitest"
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "../src/accordion"
import {
  Carousel,
  CarouselContent,
  CarouselIndicator,
  CarouselIndicatorGroup,
  CarouselItem,
  CarouselNext,
  CarouselPlayToggle,
  CarouselPrevious,
  CarouselViewport,
} from "../src/carousel"
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
import {
  Pagination,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationList,
  PaginationNext,
  PaginationPrevious,
} from "../src/pagination"
import { Resizable, ResizableHandle, ResizablePanel } from "../src/resizable"
import {
  ScrollArea,
  ScrollAreaContent,
  ScrollAreaScrollbar,
  ScrollAreaScrollToEnd,
  ScrollAreaThumb,
  ScrollAreaViewport,
} from "../src/scroll-area"
import { Tabs, TabsIndicator, TabsList, TabsPanel, TabsTab } from "../src/tabs"

// Runs with no DOM: any access to window, document or storage during render
// throws. Solid renders boolean attributes bare, like `hidden`, and marks
// elements with hydration keys, so matches allow attributes between.

describe("server rendering tabs", () => {
  test("renders the selected tab as the tab stop and only its panel", () => {
    const html = renderToString(() => (
      <Tabs defaultValue="b">
        <TabsList aria-label="Settings">
          <TabsTab value="a">A</TabsTab>
          <TabsTab value="b">B</TabsTab>
          <TabsIndicator />
        </TabsList>
        <TabsPanel value="a">Panel A</TabsPanel>
        <TabsPanel value="b">Panel B</TabsPanel>
      </Tabs>
    ))
    expect(typeof window).toBe("undefined")
    expect(html).toContain('role="tablist"')
    expect(html).toMatch(
      /aria-selected="true"[^>]*tabindex="0"|tabindex="0"[^>]*aria-selected="true"/
    )
    expect(html).toContain("Panel B")
    expect(html).not.toContain("Panel A")
  })

  test("kept panels render hidden", () => {
    const html = renderToString(() => (
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTab value="a">A</TabsTab>
          <TabsTab value="b">B</TabsTab>
        </TabsList>
        <TabsPanel value="a">Panel A</TabsPanel>
        <TabsPanel value="b" keepMounted>
          Panel B
        </TabsPanel>
      </Tabs>
    ))
    expect(html).toMatch(/<div[^>]*\shidden[\s>][^>]*>Panel B/)
  })
})

describe("server rendering an accordion", () => {
  const items = (keepMounted?: boolean) =>
    ["a", "b"].map((value) => (
      <AccordionItem value={value}>
        <AccordionHeader>
          <AccordionTrigger>{`Trigger ${value}`}</AccordionTrigger>
        </AccordionHeader>
        <AccordionPanel
          keepMounted={keepMounted}
        >{`Panel ${value}`}</AccordionPanel>
      </AccordionItem>
    ))

  test("renders open panels with their content and leaves closed ones out", () => {
    const html = renderToString(() => (
      <Accordion defaultValue={["b"]}>{items()}</Accordion>
    ))
    expect(html).toContain("<h3")
    expect(html).toMatch(/aria-expanded="true"[^>]*>Trigger b/)
    expect(html).toMatch(/aria-expanded="false"[^>]*>Trigger a/)
    expect(html).toContain('role="region"')
    expect(html).toContain("Panel b")
    expect(html).not.toContain("Panel a")
  })

  test("kept and findable panels render hidden, findable ones as until-found", () => {
    const kept = renderToString(() => (
      <Accordion defaultValue={["b"]}>{items(true)}</Accordion>
    ))
    expect(kept).toMatch(/<div[^>]*\shidden[\s>][^>]*>Panel a/)
    const findable = renderToString(() => (
      <Accordion defaultValue={["b"]} hiddenUntilFound>
        {items()}
      </Accordion>
    ))
    expect(findable).toMatch(/<div[^>]*hidden="until-found"[^>]*>Panel a/)
    expect(findable).toMatch(/<div(?![^>]*hidden)[^>]*>Panel b/)
  })
})

describe("server rendering a navigation menu", () => {
  const menu = (props: { defaultValue?: string; keepMounted?: boolean }) => (
    <NavigationMenu aria-label="Main" defaultValue={props.defaultValue}>
      <NavigationMenuList>
        <NavigationMenuItem value="products">
          <NavigationMenuTrigger>Products</NavigationMenuTrigger>
          <NavigationMenuContent keepMounted={props.keepMounted}>
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

  test("a closed menu is a navigation landmark with collapsed buttons and the current link", () => {
    const html = renderToString(() => menu({}))
    expect(html).toMatch(/^<nav[^>]*aria-label="Main"/)
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('aria-current="page"')
    expect(html).not.toContain("Analytics")
  })

  test("an open menu renders its panel in place, shown", () => {
    const html = renderToString(() => menu({ defaultValue: "products" }))
    expect(html).toContain('aria-expanded="true"')
    expect(html).toMatch(/aria-controls="[^"]+-content-products"/)
    expect(html).toContain("Analytics")
    expect(html).not.toMatch(
      /data-slot="navigation-menu-content"[^>]*\shidden[\s>]/
    )
  })

  test("a closed panel kept mounted is in the HTML, hidden", () => {
    const html = renderToString(() => menu({ keepMounted: true }))
    expect(html).toContain("Analytics")
    expect(html).toMatch(
      /data-slot="navigation-menu-content"[^>]*\shidden[\s>]/
    )
  })
})

describe("server rendering a resizable group", () => {
  test("panels take their default size as their basis, and the rest grow into what's left", () => {
    const html = renderToString(() => (
      <Resizable autoSaveId="editor">
        <ResizablePanel id="sidebar" defaultSize={25} />
        <ResizableHandle aria-label="Resize sidebar" />
        <ResizablePanel id="main" />
        <ResizableHandle aria-label="Resize preview" />
        <ResizablePanel id="preview" defaultSize="240px" />
      </Resizable>
    ))
    expect(html).toContain("flex:0 1 var(--resizable-panel-size, 25%)")
    expect(html).toContain("flex:1 1 var(--resizable-panel-size, 0px)")
    expect(html).toContain("flex:0 1 var(--resizable-panel-size, 240px)")
    expect(html).toContain('role="separator"')
    expect(html).toContain('aria-orientation="vertical"')
    expect(html).not.toContain("tabindex")
    expect(html).not.toContain("aria-valuenow")
  })
})

describe("server rendering a scroll area", () => {
  const html = renderToString(() => (
    <ScrollArea stickToEnd>
      <ScrollAreaViewport aria-label="Messages">
        <ScrollAreaContent>Hello</ScrollAreaContent>
      </ScrollAreaViewport>
      <ScrollAreaScrollbar>
        <ScrollAreaThumb />
      </ScrollAreaScrollbar>
      <ScrollAreaScrollToEnd>Jump to latest</ScrollAreaScrollToEnd>
    </ScrollArea>
  ))

  test("the viewport scrolls and hides native scrollbars already, so they never flash", () => {
    expect(html).toMatch(
      /data-slot="scroll-area-viewport"[^>]*style="overflow:auto;scrollbar-width:none"/
    )
  })

  test("the scrollbar is hidden from screen readers, and from view until the content is measured", () => {
    expect(html).toMatch(
      /data-slot="scroll-area-scrollbar"[^>]*aria-hidden="true"/
    )
    expect(html).toMatch(/data-slot="scroll-area-scrollbar"[^>]*display:none/)
  })

  test("the content resets the per-frame variables, and the button is a button", () => {
    expect(html).toContain("--scroll-area-overflow-y-start:initial")
    expect(html).toMatch(
      /<button[^>]*type="button"[^>]*>Jump to latest<\/button>/
    )
  })
})

describe("server rendering a carousel", () => {
  test("renders the pattern's roles and native snapping, so it pages before hydration", () => {
    const html = renderToString(() => (
      <Carousel aria-label="Featured" defaultPage={2}>
        <CarouselViewport>
          <CarouselContent>
            <CarouselItem>One</CarouselItem>
            <CarouselItem>Two</CarouselItem>
          </CarouselContent>
        </CarouselViewport>
        <CarouselPrevious>Previous</CarouselPrevious>
        <CarouselNext>Next</CarouselNext>
        <CarouselIndicatorGroup aria-label="Choose a slide">
          <CarouselIndicator page={1}>1</CarouselIndicator>
          <CarouselIndicator page={2}>2</CarouselIndicator>
        </CarouselIndicatorGroup>
      </Carousel>
    ))
    expect(html).toContain('aria-roledescription="carousel"')
    expect(html).toContain('aria-roledescription="slide"')
    expect(html).toContain("scroll-snap-type:x mandatory")
    expect(html).toContain("scroll-snap-align:start")
    expect(html).toMatch(/aria-selected="true"[^>]*>2</)
    // Slides aren't hidden until they're measured, so nothing is lost without JavaScript.
    expect(html).not.toContain("inert")
  })

  test("a rotating carousel renders its toggle's state and turns the live region off", () => {
    const html = renderToString(() => (
      <Carousel aria-label="Featured" defaultPlaying>
        <CarouselPlayToggle>
          {(state) => (state.playing ? "Stop" : "Start")}
        </CarouselPlayToggle>
        <CarouselViewport>
          <CarouselContent>
            <CarouselItem>One</CarouselItem>
          </CarouselContent>
        </CarouselViewport>
      </Carousel>
    ))
    expect(html).toContain(">Stop<")
    expect(html).toContain('aria-live="off"')
  })
})

describe("server rendering a pagination", () => {
  const pages = (getHref?: (page: number) => string) => (
    <Pagination
      aria-label="Pages"
      pageCount={10}
      defaultPage={5}
      getHref={getHref}
    >
      <PaginationList>
        {({ items }) => (
          <>
            <PaginationItem>
              <PaginationPrevious>Previous</PaginationPrevious>
            </PaginationItem>
            {items.map((item) => (
              <PaginationItem>
                {typeof item === "number" ? (
                  <PaginationLink page={item} />
                ) : (
                  <PaginationEllipsis />
                )}
              </PaginationItem>
            ))}
            <PaginationItem>
              <PaginationNext>Next</PaginationNext>
            </PaginationItem>
          </>
        )}
      </PaginationList>
    </Pagination>
  )

  test("the server renders the landmark, the range and the current page", () => {
    const html = renderToString(() => pages())
    expect(html).toMatch(/<nav[^>]*aria-label="Pages"/)
    expect(html).toContain('role="list"')
    expect(html).toMatch(/aria-current="page"[^>]*>5</)
    expect(html.match(/aria-hidden="true"[^>]*>…/g)).toHaveLength(2)
  })

  test("with getHref the server renders links that work before hydration", () => {
    const html = renderToString(() => pages((page) => `/results?page=${page}`))
    expect(html).toContain('href="/results?page=4"')
    expect(html).toContain('href="/results?page=6"')
    expect(html).not.toContain('type="button"')
  })
})
