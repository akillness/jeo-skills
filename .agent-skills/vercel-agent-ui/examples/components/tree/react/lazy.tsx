"use client"

import {
  Tree,
  TreeGroup,
  TreeItem,
  TreeItemIndicator,
  TreeItemLabel,
} from "@ui-sdk/react/tree"
import { ChevronRightIcon, LoaderCircleIcon, RotateCwIcon } from "lucide-react"
import * as React from "react"

type Node = { value: string; label: string; branch?: boolean }

const top: Node[] = [
  { value: "users", label: "users", branch: true },
  { value: "orders", label: "orders", branch: true },
  { value: "archive", label: "archive", branch: true },
]

let archiveAsked = false
async function fetchChildren(value: string, signal: AbortSignal) {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, 800)
    signal.addEventListener(
      "abort",
      () => (clearTimeout(timer), reject(signal.reason))
    )
  })
  if (value === "archive" && !archiveAsked) {
    archiveAsked = true
    throw new Error("Network error")
  }
  return Array.from({ length: 3 }, (_, index) => ({
    value: `${value}/${index + 1}`,
    label: `${value.slice(0, -1)}_${index + 1}.json`,
  }))
}

function Items({
  items,
  loaded,
}: {
  items: Node[]
  loaded: Record<string, Node[]>
}) {
  return items.map((item) => (
    <TreeItem key={item.value} value={item.value} branch={item.branch}>
      <TreeItemLabel>
        {item.branch && (
          <TreeItemIndicator>
            {(state) =>
              state.loading ? (
                <LoaderCircleIcon aria-hidden="true" />
              ) : state.failed ? (
                <RotateCwIcon aria-hidden="true" />
              ) : (
                <ChevronRightIcon aria-hidden="true" />
              )
            }
          </TreeItemIndicator>
        )}
        {item.label}
      </TreeItemLabel>
      {loaded[item.value] && (
        <TreeGroup>
          <Items items={loaded[item.value]} loaded={loaded} />
        </TreeGroup>
      )}
    </TreeItem>
  ))
}

function Example() {
  const [loaded, setLoaded] = React.useState<Record<string, Node[]>>({})
  return (
    <Tree
      aria-label="Database"
      loadChildren={async (value, { signal }) => {
        const children = await fetchChildren(value, signal)
        setLoaded((loaded) => ({ ...loaded, [value]: children }))
      }}
      announcement={({ type, label }) =>
        ({
          expanded: "Expanded",
          collapsed: "Collapsed",
          loading: `Loading ${label}`,
          "load-failed": `${label} didn't load. Try again.`,
        })[type]
      }
    >
      <Items items={top} loaded={loaded} />
    </Tree>
  )
}

export { Example }
