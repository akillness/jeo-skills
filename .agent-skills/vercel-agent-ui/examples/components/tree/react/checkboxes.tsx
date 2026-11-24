"use client"

import {
  Tree,
  TreeGroup,
  TreeItem,
  TreeItemCheckbox,
  TreeItemIndicator,
  TreeItemLabel,
  type TreeItemData,
} from "@ui-sdk/react/tree"
import { ChevronRightIcon } from "lucide-react"
import { useLog } from "../../../shared/react/log"

const items: TreeItemData[] = [
  {
    value: "frontend",
    label: "Frontend",
    children: [
      { value: "react", label: "React" },
      { value: "vue", label: "Vue" },
      { value: "svelte", label: "Svelte" },
    ],
  },
  {
    value: "backend",
    label: "Backend",
    children: [
      { value: "node", label: "Node" },
      {
        value: "databases",
        label: "Databases",
        children: [
          { value: "postgres", label: "Postgres" },
          { value: "sqlite", label: "SQLite" },
        ],
      },
    ],
  },
]

function Items({ items }: { items: TreeItemData[] }) {
  return items.map((item) => (
    <TreeItem key={item.value} value={item.value}>
      <TreeItemLabel>
        {item.children && (
          <TreeItemIndicator>
            <ChevronRightIcon aria-hidden="true" />
          </TreeItemIndicator>
        )}
        <TreeItemCheckbox />
        {item.label}
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
      aria-label="Stack"
      items={items}
      checkable
      mode="none"
      checkStrategy="trunk"
      defaultChecked={["react", "postgres"]}
      onCheckedChange={(checked) =>
        log(`Checked ${checked.join(", ") || "nothing"}`)
      }
      defaultExpanded={["frontend", "backend", "databases"]}
    >
      <Items items={items} />
    </Tree>
  )
}

export { Example }
