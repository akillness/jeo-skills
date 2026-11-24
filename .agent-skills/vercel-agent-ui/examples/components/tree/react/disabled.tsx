"use client"

import { Switch, SwitchThumb } from "@ui-sdk/react/switch"
import {
  Tree,
  TreeGroup,
  TreeItem,
  TreeItemIndicator,
  TreeItemLabel,
  type TreeItemData,
} from "@ui-sdk/react/tree"
import { ChevronRightIcon } from "lucide-react"
import * as React from "react"

const items: TreeItemData[] = [
  {
    value: "plans",
    label: "Plans",
    children: [
      { value: "free", label: "Free" },
      { value: "pro", label: "Pro" },
      { value: "enterprise", label: "Enterprise", disabled: true },
    ],
  },
  {
    value: "legacy",
    label: "Legacy plans",
    disabled: true,
    children: [{ value: "starter", label: "Starter" }],
  },
  { value: "custom", label: "Custom" },
]

function Items({ items }: { items: TreeItemData[] }) {
  return items.map((item) => (
    <TreeItem key={item.value} value={item.value} disabled={item.disabled}>
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
  const [focusable, setFocusable] = React.useState(true)
  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <label data-slot="label">
          <Switch checked={focusable} onCheckedChange={setFocusable}>
            <SwitchThumb />
          </Switch>
          Focusable when disabled
        </label>
      </div>
      <Tree
        aria-label="Plans"
        items={items}
        defaultExpanded={["plans"]}
        focusableWhenDisabled={focusable}
      >
        <Items items={items} />
      </Tree>
    </div>
  )
}

export { Example }
