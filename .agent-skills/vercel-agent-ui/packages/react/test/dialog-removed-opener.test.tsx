// @vitest-environment jsdom
import * as React from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, expect, test } from "vitest"
import {
  createDialogController,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "../src/dialog"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
Element.prototype.getAnimations ??= () => []
HTMLElement.prototype.showPopover ??= function () {}
HTMLElement.prototype.hidePopover ??= function () {}
// jsdom has no top layer or layout, so open popovers show and visibility follows display.
document.head.append(
  Object.assign(document.createElement("style"), {
    textContent: "[popover][data-open] { display: block !important }",
  })
)
Element.prototype.checkVisibility ??= function (this: Element) {
  for (let node: Element | null = this; node; node = node.parentElement) {
    if (getComputedStyle(node).display === "none") {
      return false
    }
  }
  return this.isConnected
}

let root: Root | undefined
afterEach(async () => {
  await React.act(async () => root?.unmount())
  document.body.replaceChildren()
})

const settle = () =>
  React.act(() => new Promise((resolve) => setTimeout(resolve, 20)))
const button = (name: string) =>
  [...document.querySelectorAll("button")].find((b) => b.textContent === name)
async function press(name: string) {
  const el = button(name)!
  el.focus()
  await React.act(async () => el.click())
  await settle()
}
const focused = () =>
  document.activeElement === document.body
    ? "<body>"
    : document.activeElement?.textContent

type Opening = "plain button" | "mounted open" | "controller"

function Rows({
  opening,
  workaround,
}: {
  opening: Opening
  workaround?: boolean
}) {
  const [rows, setRows] = React.useState(["Alpha", "Beta"])
  const [removing, setRemoving] = React.useState<string | null>(null)
  const [controller] = React.useState(() => createDialogController())
  const next = React.useRef<string | undefined>(undefined)
  const pick = (row: string) => {
    const i = rows.indexOf(row)
    next.current = rows[i + 1] ?? rows[i - 1]
    if (opening !== "controller") {
      setRemoving(row)
    }
  }
  const remove = (row: string | null) =>
    setRows((all) => all.filter((r) => r !== row))
  const onOpenChange = (open: boolean) => {
    if (!open) {
      setRemoving(null)
    }
  }
  const content = (
    <DialogContent
      finalFocus={
        workaround ? () => button(`Remove ${next.current}`) : undefined
      }
    >
      {(state) => {
        const row = removing ?? (state.payload as string)
        return (
          <>
            <DialogTitle>Remove {row}?</DialogTitle>
            <DialogClose onClick={() => remove(row)}>Remove</DialogClose>
            <button onClick={() => remove(row)}>Remove, stay open</button>
            <DialogClose>Cancel</DialogClose>
          </>
        )
      }}
    </DialogContent>
  )
  return (
    <>
      <ul>
        {rows.map((row) => (
          <li key={row}>
            {row}
            {opening === "controller" ? (
              <DialogTrigger
                controller={controller}
                payload={row}
                onClick={() => pick(row)}
              >
                Remove {row}
              </DialogTrigger>
            ) : (
              <button onClick={() => pick(row)}>Remove {row}</button>
            )}
          </li>
        ))}
      </ul>
      {opening === "controller" ? (
        <Dialog controller={controller}>{content}</Dialog>
      ) : opening === "plain button" ? (
        <Dialog open={removing !== null} onOpenChange={onOpenChange}>
          {content}
        </Dialog>
      ) : removing ? (
        <Dialog open onOpenChange={onOpenChange}>
          {content}
        </Dialog>
      ) : null}
    </>
  )
}

async function open(opening: Opening, workaround?: boolean) {
  root = createRoot(document.body.appendChild(document.createElement("div")))
  await React.act(async () =>
    root!.render(<Rows opening={opening} workaround={workaround} />)
  )
  await press("Remove Alpha")
  expect(document.querySelector("[role=dialog]")).not.toBeNull()
}

const openings: Opening[] = ["plain button", "mounted open", "controller"]

test.each(openings)(
  "%s: Remove deletes the row and closes",
  async (opening) => {
    await open(opening)
    await press("Remove")
    expect(button("Remove Alpha")).toBeUndefined()
    expect(focused()).toBe("Remove Beta")
  }
)

test.each(openings)(
  "%s: the row goes while open, then Cancel",
  async (opening) => {
    await open(opening)
    await press("Remove, stay open")
    expect(button("Remove Alpha")).toBeUndefined()
    await press("Cancel")
    expect(focused()).toBe("Remove Beta")
  }
)

test.each(openings)("%s: Cancel, the row stays", async (opening) => {
  await open(opening)
  await press("Cancel")
  expect(focused()).toBe("Remove Alpha")
})

test.each(openings)("%s: finalFocus names the next row", async (opening) => {
  await open(opening, true)
  await press("Remove")
  expect(focused()).toBe("Remove Beta")
})

test.each(openings)(
  "%s: finalFocus names the next row, then Cancel",
  async (opening) => {
    await open(opening, true)
    await press("Cancel")
    expect(focused()).toBe("Remove Beta")
  }
)
