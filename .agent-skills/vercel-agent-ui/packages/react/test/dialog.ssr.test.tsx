// @vitest-environment node
import { renderToString } from "react-dom/server"
import { describe, expect, test } from "vitest"
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../src/alert-dialog"
import {
  createDialogController,
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogShortcut,
  DialogTitle,
  DialogTrigger,
} from "../src/dialog"

// Runs with no DOM: any access to window or document during render throws.
describe("dialog server rendering", () => {
  const dialog = (open: boolean) => (
    <Dialog defaultOpen={open}>
      <DialogTrigger shortcut="mod+k">
        Edit profile <DialogShortcut />
      </DialogTrigger>
      <DialogBackdrop />
      <DialogContent>
        <DialogTitle>Profile settings</DialogTitle>
        <DialogDescription>Make changes to your profile.</DialogDescription>
        <DialogClose action={() => Promise.resolve()}>Save</DialogClose>
      </DialogContent>
    </Dialog>
  )

  test("a closed dialog renders its trigger only, with no aria-expanded on a modal trigger", () => {
    const html = renderToString(dialog(false))
    expect(typeof window).toBe("undefined")
    expect(html).toContain('aria-haspopup="dialog"')
    expect(html).not.toContain("aria-expanded")
    expect(html).not.toContain('role="dialog"')
  })

  test("the shortcut renders the same on the server and the first client render", () => {
    const html = renderToString(dialog(false))
    // Neutral names until the client knows its platform, so hydration never mismatches.
    expect(html).toContain('aria-keyshortcuts="Control+K"')
    expect(html).toContain("Ctrl+K")
  })

  test("an open dialog renders its content in place, modal and visible before hydration", () => {
    const html = renderToString(dialog(true))
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).not.toContain("popover=")
    expect(html).toContain("<h2")
  })

  test("an open alert dialog renders its role", () => {
    const html = renderToString(
      <AlertDialog defaultOpen>
        <AlertDialogTrigger>Delete</AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogTitle>Delete?</AlertDialogTitle>
          <AlertDialogDescription>It can't be undone.</AlertDialogDescription>
          <AlertDialogClose>Cancel</AlertDialogClose>
        </AlertDialogContent>
      </AlertDialog>
    )
    expect(html).toContain('role="alertdialog"')
  })

  test("a shortcut renders inside a trigger connected through a controller", () => {
    const search = createDialogController()
    const html = renderToString(
      <>
        <DialogTrigger controller={search} shortcut="mod+k">
          Search <DialogShortcut />
        </DialogTrigger>
        <Dialog controller={search}>
          <DialogContent>
            <DialogTitle>Search</DialogTitle>
          </DialogContent>
        </Dialog>
      </>
    )
    expect(html).toContain("Search")
  })
})
