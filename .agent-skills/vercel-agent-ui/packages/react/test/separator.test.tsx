// @vitest-environment jsdom
import * as React from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, expect, test } from "vitest"
import { Separator } from "../src/separator"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let root: Root | undefined

afterEach(async () => {
  await React.act(async () => root?.unmount())
  root = undefined
  document.body.replaceChildren()
})

test("a separator's rendered element follows a new orientation", async () => {
  const container = document.body.appendChild(document.createElement("div"))
  root = createRoot(container)
  const separator = (orientation: "horizontal" | "vertical") => (
    <Separator
      orientation={orientation}
      render={(props, state) => <hr {...props} title={state.orientation} />}
    />
  )

  await React.act(async () => root!.render(separator("horizontal")))
  await React.act(async () => root!.render(separator("vertical")))

  expect(container.innerHTML).toBe(
    '<hr data-slot="separator" role="separator" aria-orientation="vertical" data-orientation="vertical" title="vertical">'
  )
})
