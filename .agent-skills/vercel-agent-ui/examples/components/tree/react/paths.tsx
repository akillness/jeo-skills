"use client"

import {
  Tree,
  TreeGroup,
  TreeItem,
  TreeItemIndicator,
  TreeItemLabel,
  treeFromPaths,
  type TreeItemData,
} from "@ui-sdk/react/tree"
import { ChevronRightIcon, LoaderCircleIcon } from "lucide-react"
import { useLog } from "../../../shared/react/log"

const paths = [
  "src/index.ts",
  "src/lib/format.ts",
  "src/lib/parse.ts",
  "src/routes/home.tsx",
  "src/routes/about.tsx",
  "tests/",
  "package.json",
  "tsconfig.json",
]

const items = treeFromPaths(paths)
const files = new Set(paths.filter((path) => !path.endsWith("/")))

function Items({ items }: { items: TreeItemData[] }) {
  return items.map((item) => (
    <TreeItem key={item.value} value={item.value}>
      <TreeItemLabel>
        {(state) => (
          <>
            {item.children && (
              <TreeItemIndicator>
                <ChevronRightIcon aria-hidden="true" />
              </TreeItemIndicator>
            )}
            <span>{item.label}</span>
            {state.pending && <LoaderCircleIcon aria-hidden="true" />}
          </>
        )}
      </TreeItemLabel>
      {item.children && (
        <TreeGroup>
          <Items items={item.children} />
        </TreeGroup>
      )}
    </TreeItem>
  ))
}

function Example() {
  const log = useLog()
  return (
    <Tree
      aria-label="Project"
      paths={paths}
      defaultExpanded={["src"]}
      defaultValue="src/index.ts"
      activation="automatic"
      onAction={async (value) => {
        if (!files.has(value)) {
          return
        }
        await new Promise((resolve) => setTimeout(resolve, 600))
        log(`Opened ${value}`)
      }}
    >
      <Items items={items} />
    </Tree>
  )
}

export { Example }
