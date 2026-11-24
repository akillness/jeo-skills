"use client"

import {
  createTreeController,
  Tree,
  TreeGroup,
  TreeItem,
  TreeItemIndicator,
  TreeItemLabel,
  type TreeItemData,
} from "@ui-sdk/react/tree"
import { ChevronRightIcon } from "lucide-react"
import * as React from "react"

const sections: TreeItemData[] = [
  {
    value: "account",
    label: "Account",
    children: [
      { value: "profile", label: "Profile" },
      {
        value: "security",
        label: "Security",
        children: [
          { value: "password", label: "Password" },
          { value: "two-factor", label: "Two-factor authentication" },
        ],
      },
    ],
  },
  {
    value: "workspace",
    label: "Workspace",
    children: [
      { value: "members", label: "Members" },
      { value: "billing", label: "Billing" },
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
  const [settings] = React.useState(() => createTreeController())
  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button" onClick={() => settings.expandAll()}>
          Expand All
        </button>
        <button type="button" onClick={() => settings.collapseAll()}>
          Collapse All
        </button>
        <button
          type="button"
          onClick={() => {
            settings.setValue("two-factor")
            settings.reveal("two-factor")
          }}
        >
          Find Two-Factor
        </button>
      </div>
      <Tree aria-label="Settings" items={sections} controller={settings}>
        <Items items={sections} />
      </Tree>
    </div>
  )
}

export { Example }
