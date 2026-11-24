// @vitest-environment jsdom
import * as React from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, expect, test } from "vitest"
import { Input } from "../src/input"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let root: Root | undefined
afterEach(async () => {
  await React.act(async () => root?.unmount())
  root = undefined
  document.body.replaceChildren()
})

const native = Object.getOwnPropertyDescriptor(
  HTMLInputElement.prototype,
  "value"
)!
const seen: string[] = []

function wrapOnce(el: HTMLInputElement) {
  const inner = Object.getOwnPropertyDescriptor(el, "value") ?? native
  Object.defineProperty(el, "value", {
    configurable: true,
    get() {
      return inner.get!.call(this)
    },
    set(value: string) {
      seen.push(value)
      inner.set!.call(this, value)
    },
  })
}

function Wrapped() {
  const ref = React.useRef<HTMLInputElement>(null)
  const done = React.useRef(false)
  React.useEffect(() => {
    if (ref.current && !done.current) {
      done.current = true
      wrapOnce(ref.current)
    }
  }, [])
  return <Input ref={ref} aria-label="Name" defaultValue="" />
}

test("a value wrapper added after the input binds survives StrictMode's remount", async () => {
  const host = document.body.appendChild(document.createElement("div"))
  await React.act(async () => {
    root = createRoot(host)
    root.render(
      <React.StrictMode>
        <Wrapped />
      </React.StrictMode>
    )
  })
  host.querySelector("input")!.value = "x"
  expect(seen).toEqual(["x"])
})
