// @vitest-environment node
import { renderToString } from "@vue/server-renderer"
import { describe, expect, test } from "vitest"
import { type Component, createSSRApp, h } from "vue"
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  createDialogController,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogShortcut,
  DialogTitle,
  DialogTrigger,
} from "../src"

// A module-level controller, as apps write one, outlives every request.
const shared = createDialogController()

// Runs with no DOM: any access to window or document during render throws.
describe("dialog server rendering", () => {
  const app = (open: boolean) =>
    createSSRApp(() =>
      h(Dialog, { defaultOpen: open }, () => [
        h(DialogTrigger, { shortcut: "mod+k" }, () => [
          "Edit profile",
          h(DialogShortcut),
        ]),
        h(DialogContent, null, () => [
          h(DialogTitle, null, () => "Profile settings"),
          h(DialogDescription, null, () => "Make changes to your profile."),
          h(DialogClose, null, () => "Close"),
        ]),
      ])
    )

  test("a closed dialog renders its trigger only, with its shortcut", async () => {
    const html = await renderToString(app(false))
    expect(typeof window).toBe("undefined")
    expect(html).toContain('aria-haspopup="dialog"')
    expect(html).toContain('aria-keyshortcuts="Control+K"')
    expect(html).toContain("Ctrl+K")
    expect(html).not.toContain('role="dialog"')
  })

  test("an open dialog renders its content in place", async () => {
    const html = await renderToString(app(true))
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain("<h2")
  })

  test("a shortcut inside a trigger connected through a controller renders nothing until the client finds the dialog", async () => {
    const search = createDialogController()
    const html = await renderToString(
      createSSRApp(() => [
        h(DialogTrigger, { controller: search, shortcut: "mod+k" }, () => [
          "Search",
          h(DialogShortcut),
        ]),
        h(Dialog, { controller: search }, () =>
          h(DialogContent, null, () => h(DialogTitle, null, () => "Search"))
        ),
      ])
    )
    expect(html).toContain("Search")
    expect(html).not.toContain('data-slot="dialog-shortcut"')
  })

  test("a trigger connected through a controller hands its slots state and children before it binds", async () => {
    const search = createDialogController()
    const html = await renderToString(
      createSSRApp(() => [
        h(
          DialogTrigger,
          { controller: search },
          ({ state }: { state: { open: boolean } }) =>
            state.open ? "Close" : "Open"
        ),
        h(
          DialogTrigger,
          { controller: search },
          {
            default: () => "Search",
            render: ({
              props,
              children,
            }: {
              props: object
              children: Component
            }) => [h("a", props, [h(children)])],
          }
        ),
        h(Dialog, { controller: search }),
      ])
    )
    expect(html).toMatch(/<button[^>]*>Open<\/button>/)
    expect(html).toMatch(/<a[^>]*>(<!--\[-->)?Search(<!--]-->)?<\/a>/)
  })

  test("a controller made once for every request reaches no dialog the server rendered", async () => {
    const html = await renderToString(
      createSSRApp(() =>
        h(Dialog, { controller: shared, defaultOpen: true }, () =>
          h(DialogContent, null, () => "Hi")
        )
      )
    )
    expect(html).toContain("Hi")
    expect("isOpen" in shared).toBe(false)
    expect(shared.isOpen()).toBeUndefined()
  })

  test("an open alert dialog renders its role", async () => {
    const html = await renderToString(
      createSSRApp(() =>
        h(AlertDialog, { defaultOpen: true }, () => [
          h(AlertDialogContent, null, () => [
            h(AlertDialogTitle, null, () => "Delete?"),
            h(AlertDialogDescription, null, () => "It can't be undone."),
            h(AlertDialogClose, null, () => "Cancel"),
          ]),
        ])
      )
    )
    expect(html).toContain('role="alertdialog"')
  })
})

describe("alert dialog props", () => {
  test("takes none of the props only a dialog has", () => {
    const props = Object.keys(
      (AlertDialog as unknown as { props: object }).props
    )
    expect(props).not.toContain("modal")
    expect(props).not.toContain("closeOnOutsidePress")
    expect(props).not.toContain("presentation")
    expect(Object.keys((Dialog as unknown as { props: object }).props)).toEqual(
      expect.arrayContaining(["modal", "closeOnOutsidePress", "presentation"])
    )
  })
})
