// @vitest-environment jsdom
import * as React from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, expect, test } from "vitest"
import { Button } from "../src/button"
import { withSource } from "../src/observe"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let root: Root | undefined

afterEach(async () => {
  await React.act(async () => root?.unmount())
  root = undefined
  document.body.replaceChildren()
})

test("a press hands the handler its event and how the button was pressed", async () => {
  const calls: [string, string][] = []
  const host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  await React.act(async () =>
    root!.render(
      <Button onClick={(event, { source }) => calls.push([event.type, source])}>
        Save
      </Button>
    )
  )
  const button = host.querySelector("button")!
  await React.act(async () => withSource("agent", () => button.click()))
  expect(calls).toEqual([["click", "agent"]])
})

test("a disabled or pending button tells a router link that runs after it not to navigate", async () => {
  const navigations: string[] = []
  // Like Next.js's Link: it calls the onClick it was given, then reads React's event.
  function RouterLink({ onClick, ...props }: React.ComponentProps<"a">) {
    return (
      <a
        {...props}
        onClick={(event) => {
          onClick?.(event)
          if (!event.defaultPrevented) {
            navigations.push(props.href!)
          }
          event.preventDefault()
        }}
      />
    )
  }
  const host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  await React.act(async () =>
    root!.render(
      <>
        <Button render={<RouterLink href="/enabled" />}>Enabled</Button>
        <Button disabled render={<RouterLink href="/disabled" />}>
          Disabled
        </Button>
        <Button
          onClick={() => new Promise(() => {})}
          render={<RouterLink href="/pending" />}
        >
          Pending
        </Button>
      </>
    )
  )
  for (const link of host.querySelectorAll("a")) {
    await React.act(async () => link.click())
  }
  await React.act(async () => host.querySelectorAll("a")[2]!.click())
  expect(navigations).toEqual(["/enabled", "/pending"])
})
