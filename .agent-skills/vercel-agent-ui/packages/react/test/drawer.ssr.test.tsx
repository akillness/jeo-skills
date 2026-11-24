// @vitest-environment node
import { renderToString } from "react-dom/server"
import { describe, expect, test } from "vitest"
import {
  createDrawerController,
  Drawer,
  DrawerBackdrop,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHandle,
  DrawerShortcut,
  DrawerTitle,
  DrawerTrigger,
} from "../src/drawer"

// Runs with no DOM: any access to window or document during render throws.
describe("drawer server rendering", () => {
  const drawer = (open: boolean) => (
    <Drawer defaultOpen={open} snapPoints={[0.5, 1]} side="start">
      <DrawerTrigger>Move goal</DrawerTrigger>
      <DrawerBackdrop />
      <DrawerContent>
        <DrawerHandle aria-label="Resize" />
        <DrawerTitle>Move goal</DrawerTitle>
        <DrawerDescription>Set your daily activity goal.</DrawerDescription>
        <DrawerClose>Cancel</DrawerClose>
      </DrawerContent>
    </Drawer>
  )

  test("a closed drawer renders its trigger only", () => {
    const html = renderToString(drawer(false))
    expect(typeof window).toBe("undefined")
    expect(html).toContain('aria-haspopup="dialog"')
    expect(html).not.toContain('role="dialog"')
  })

  test("an open drawer renders its content in place, modal, at its first snap point", () => {
    const html = renderToString(drawer(true))
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('data-snap-point="0.5"')
    expect(html).not.toContain("popover=")
    expect(html).toContain("<h2")
  })

  for (const controlled of [false, true]) {
    for (const snapPoint of [0.25, 1]) {
      test(`an initially ${controlled ? "controlled" : "uncontrolled"} open drawer renders ${snapPoint === 0.25 ? "at" : "above"} its modal threshold`, () => {
        const html = renderToString(
          <Drawer
            {...(controlled ? { open: true } : { defaultOpen: true })}
            snapPoints={[0.25, 1]}
            defaultSnapPoint={snapPoint}
            modalAbove={0.25}
          >
            <DrawerBackdrop />
            <DrawerContent>
              <DrawerTitle>Move goal</DrawerTitle>
            </DrawerContent>
          </Drawer>
        )
        const content = html.match(
          /<div[^>]*data-slot="drawer-content"[^>]*>/
        )?.[0]
        const backdrop = html.match(
          /<div[^>]*data-slot="drawer-backdrop"[^>]*>/
        )?.[0]
        expect(content).toBeDefined()
        expect(backdrop).toBeDefined()
        expect(content).toContain('role="dialog"')
        expect(content).toContain(`data-snap-point="${snapPoint}"`)
        if (snapPoint === 0.25) {
          expect(content).toContain('data-interactive=""')
          expect(backdrop).toContain('data-interactive=""')
          expect(content).not.toContain("aria-modal")
        } else {
          expect(content).not.toContain("data-interactive")
          expect(backdrop).not.toContain("data-interactive")
          expect(content).toContain('aria-modal="true"')
        }
      })
    }
  }

  test("a logical side renders as its left-to-right edge until the client reads the direction", () => {
    expect(renderToString(drawer(true))).toContain('data-side="left"')
  })

  test("a shortcut renders inside a trigger, with neutral names until the client knows its platform", () => {
    const html = renderToString(
      <Drawer>
        <DrawerTrigger shortcut="mod+g">
          Move goal <DrawerShortcut />
        </DrawerTrigger>
      </Drawer>
    )
    expect(html).toContain('aria-keyshortcuts="Control+G"')
    expect(html).toMatch(
      /<span[^>]*aria-hidden="true"[^>]*>\u2066Ctrl\+G\u2069<\/span>/
    )
  })

  test("a shortcut inside a trigger connected through a controller renders nothing until the client finds the drawer", () => {
    const goal = createDrawerController()
    const html = renderToString(
      <>
        <DrawerTrigger controller={goal} shortcut="mod+g">
          Move goal <DrawerShortcut />
        </DrawerTrigger>
        <Drawer controller={goal}>
          <DrawerContent>
            <DrawerTitle>Move goal</DrawerTitle>
          </DrawerContent>
        </Drawer>
      </>
    )
    expect(html).toContain("Move goal")
    expect(html).not.toContain('data-slot="drawer-shortcut"')
  })
})
