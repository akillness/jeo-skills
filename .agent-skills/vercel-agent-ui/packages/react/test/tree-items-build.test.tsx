// @vitest-environment jsdom
import * as React from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, expect, test } from "vitest"
import { Tree, TreeItem, TreeItemLabel } from "../src/tree"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let root: Root | undefined

afterEach(async () => {
  await React.act(async () => root?.unmount())
  root = undefined
  document.body.replaceChildren()
})

test("a new items array builds the tree once", async () => {
  let builds = 0
  const counted = (list: { value: string; label: string }[]) => {
    const items = [...list]
    items[Symbol.iterator] = function* () {
      builds++
      yield* Array.prototype.values.call(this)
    }
    return items
  }
  const rows = Array.from({ length: 50 }, (_, i) => ({
    value: `item-${i}`,
    label: `Item ${i}`,
  }))
  let moveLastToTop = () => {}
  function App() {
    const [order, setOrder] = React.useState(rows)
    moveLastToTop = () =>
      setOrder((current) => [current.at(-1)!, ...current.slice(0, -1)])
    const items = React.useMemo(() => counted(order), [order])
    return (
      <Tree aria-label="Rows" items={items}>
        {order.slice(0, 10).map((row) => (
          <TreeItem key={row.value} value={row.value}>
            <TreeItemLabel>{row.label}</TreeItemLabel>
          </TreeItem>
        ))}
      </Tree>
    )
  }
  root = createRoot(document.body.appendChild(document.createElement("div")))
  await React.act(async () => root!.render(<App />))
  builds = 0
  await React.act(async () => moveLastToTop())
  expect(builds).toBe(1)
})
