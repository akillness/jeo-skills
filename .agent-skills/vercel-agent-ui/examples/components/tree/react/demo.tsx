"use client"

import {
  Tree,
  TreeGroup,
  TreeItem,
  TreeItemIndicator,
  TreeItemLabel,
} from "@ui-sdk/react/tree"
import {
  ChevronRightIcon,
  FileIcon,
  FolderIcon,
  FolderOpenIcon,
} from "lucide-react"

type Node = { value: string; label: string; children?: Node[] }

const files: Node[] = [
  {
    value: "app",
    label: "app",
    children: [
      { value: "app/layout.tsx", label: "layout.tsx" },
      { value: "app/page.tsx", label: "page.tsx" },
      {
        value: "app/settings",
        label: "settings",
        children: [{ value: "app/settings/page.tsx", label: "page.tsx" }],
      },
    ],
  },
  {
    value: "components",
    label: "components",
    children: [
      { value: "components/button.tsx", label: "button.tsx" },
      { value: "components/card.tsx", label: "card.tsx" },
    ],
  },
  { value: "components.json", label: "components.json" },
  { value: "package.json", label: "package.json" },
  { value: "README.md", label: "README.md" },
]

function Items({ items }: { items: Node[] }) {
  return items.map((item) => (
    <TreeItem key={item.value} value={item.value}>
      <TreeItemLabel>
        {item.children ? (
          <>
            <TreeItemIndicator>
              <ChevronRightIcon aria-hidden="true" />
            </TreeItemIndicator>
            <FolderIcon aria-hidden="true" />
            <FolderOpenIcon aria-hidden="true" />
          </>
        ) : (
          <FileIcon aria-hidden="true" />
        )}
        <span>{item.label}</span>
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
  return (
    <Tree
      aria-label="Files"
      defaultExpanded={["app"]}
      defaultValue="app/page.tsx"
    >
      <Items items={files} />
    </Tree>
  )
}

export { Example }
