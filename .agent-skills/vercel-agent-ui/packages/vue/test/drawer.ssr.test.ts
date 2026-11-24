// @vitest-environment node
import { renderToString } from "@vue/server-renderer"
import { describe, expect, test } from "vitest"
import { createSSRApp, h } from "vue"
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
} from "../src"

// Runs with no DOM: any access to window or document during render throws.
describe("drawer server rendering", () => {
  const app = (open: boolean) =>
    createSSRApp(() =>
      h(
        Drawer,
        { defaultOpen: open, snapPoints: [0.5, 1], side: "start" },
        () => [
          h(DrawerTrigger, null, () => "Move goal"),
          h(DrawerBackdrop),
          h(DrawerContent, null, () => [
            h(DrawerHandle, { "aria-label": "Resize" }),
            h(DrawerTitle, null, () => "Move goal"),
            h(DrawerDescription, null, () => "Set your daily activity goal."),
            h(DrawerClose, null, () => "Cancel"),
          ]),
        ]
      )
    )

  test("a closed drawer renders its trigger only", async () => {
    const html = await renderToString(app(false))
    expect(typeof window).toBe("undefined")
    expect(html).toContain('aria-haspopup="dialog"')
    expect(html).not.toContain('role="dialog"')
  })

  test("an open drawer renders its content in place, modal, at its first snap point", async () => {
    const html = await renderToString(app(true))
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('data-snap-point="0.5"')
    expect(html).toContain("<h2")
  })

  for (const controlled of [false, true]) {
    for (const snapPoint of [0.25, 1]) {
      test(`an initially ${controlled ? "controlled" : "uncontrolled"} open drawer renders ${snapPoint === 0.25 ? "at" : "above"} its modal threshold`, async () => {
        const html = await renderToString(
          createSSRApp(() =>
            h(
              Drawer,
              {
                ...(controlled ? { open: true } : { defaultOpen: true }),
                snapPoints: [0.25, 1],
                defaultSnapPoint: snapPoint,
                modalAbove: 0.25,
              },
              () => [
                h(DrawerBackdrop),
                h(DrawerContent, null, () =>
                  h(DrawerTitle, null, () => "Move goal")
                ),
              ]
            )
          )
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
          expect(content).toContain("data-interactive")
          expect(backdrop).toContain("data-interactive")
          expect(content).not.toContain("aria-modal")
        } else {
          expect(content).not.toContain("data-interactive")
          expect(backdrop).not.toContain("data-interactive")
          expect(content).toContain('aria-modal="true"')
        }
      })
    }
  }

  test("a logical side renders as its left-to-right edge until the client reads the direction", async () => {
    expect(await renderToString(app(true))).toContain('data-side="left"')
  })

  test("a shortcut renders inside a trigger, with neutral names until the client knows its platform", async () => {
    const html = await renderToString(
      createSSRApp(() =>
        h(Drawer, null, () =>
          h(DrawerTrigger, { shortcut: "mod+g" }, () => [
            "Move goal",
            h(DrawerShortcut),
          ])
        )
      )
    )
    expect(html).toContain('aria-keyshortcuts="Control+G"')
    expect(html).toMatch(
      /<span[^>]*aria-hidden="true"[^>]*>\u2066Ctrl\+G\u2069<\/span>/
    )
  })

  test("a shortcut inside a trigger connected through a controller renders nothing until the client finds the drawer", async () => {
    const goal = createDrawerController()
    const html = await renderToString(
      createSSRApp(() => [
        h(DrawerTrigger, { controller: goal, shortcut: "mod+g" }, () => [
          "Move goal",
          h(DrawerShortcut),
        ]),
        h(Drawer, { controller: goal }, () =>
          h(DrawerContent, null, () => h(DrawerTitle, null, () => "Move goal"))
        ),
      ])
    )
    expect(html).toContain("Move goal")
    expect(html).not.toContain('data-slot="drawer-shortcut"')
  })
})
