import { renderToString } from "@solidjs/web"
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
    const html = renderToString(() => drawer(false))
    expect(typeof window).toBe("undefined")
    expect(html).toContain('aria-haspopup="dialog"')
    expect(html).not.toContain('role="dialog"')
  })

  test("an open drawer renders its content in place, modal, at its first snap point", () => {
    const html = renderToString(() => drawer(true))
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('data-snap-point="0.5"')
    expect(html).not.toContain("popover=")
    expect(html).toContain("<h2")
  })

  test.each(["controlled", "uncontrolled"])(
    "an initially open %s drawer starts at its configured nonmodal snap point",
    (mode) => {
      const html = renderToString(() => (
        <Drawer
          {...(mode === "controlled" ? { open: true } : { defaultOpen: true })}
          snapPoints={[0.25, 1]}
          defaultSnapPoint={0.25}
          modalAbove={0.25}
        >
          <DrawerContent>Body</DrawerContent>
        </Drawer>
      ))
      expect(html).toContain('data-snap-point="0.25"')
      expect(html).toContain("data-interactive")
      expect(html).not.toContain('aria-modal="true"')
    }
  )

  test("an initially controlled open drawer above its modal threshold renders as modal", () => {
    const html = renderToString(() => (
      <Drawer
        open
        snapPoints={[0.25, 1]}
        defaultSnapPoint={1}
        modalAbove={0.25}
      >
        <DrawerContent>Body</DrawerContent>
      </Drawer>
    ))
    expect(html).toContain('data-snap-point="1"')
    expect(html).not.toContain("data-interactive")
    expect(html).toContain('aria-modal="true"')
  })

  test("a logical side renders as its left-to-right edge until the client reads the direction", () => {
    expect(renderToString(() => drawer(true))).toContain('data-side="left"')
  })

  test("a shortcut renders inside a trigger, with neutral names until the client knows its platform", () => {
    const html = renderToString(() => (
      <Drawer>
        <DrawerTrigger shortcut="mod+g">
          Move goal <DrawerShortcut />
        </DrawerTrigger>
      </Drawer>
    ))
    expect(html).toContain('aria-keyshortcuts="Control+G"')
    expect(html).toMatch(/<span[^>]*aria-hidden="true"[^>]*>⁦Ctrl\+G⁩<\/span>/)
  })

  test("a shortcut inside a trigger connected through a controller renders nothing until the client finds the drawer", () => {
    const goal = createDrawerController()
    const html = renderToString(() => (
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
    ))
    expect(html).toContain("Move goal")
    expect(html).not.toContain('data-slot="drawer-shortcut"')
  })
})
