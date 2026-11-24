"use client"

import {
  Tree,
  TreeGroup,
  TreeItem,
  TreeItemIndicator,
  TreeItemLabel,
  type TreeItemData,
} from "@ui-sdk/react/tree"
import { ChevronRightIcon } from "lucide-react"

const items: TreeItemData[] = [
  {
    value: "planets",
    label: "Planets",
    children: [
      { value: "mercury", label: "Mercury" },
      { value: "venus", label: "Venus" },
      {
        value: "earth",
        label: "Earth",
        children: [{ value: "moon", label: "The Moon" }],
      },
      {
        value: "mars",
        label: "Mars",
        children: [
          { value: "phobos", label: "Phobos" },
          { value: "deimos", label: "Deimos" },
        ],
      },
    ],
  },
  {
    value: "dwarf-planets",
    label: "Dwarf planets",
    children: [
      { value: "ceres", label: "Ceres" },
      {
        value: "pluto",
        label: "Pluto",
        children: [{ value: "charon", label: "Charon" }],
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
  return (
    <Tree aria-label="Solar system" items={items} hiddenUntilFound>
      <Items items={items} />
    </Tree>
  )
}

export { Example }
