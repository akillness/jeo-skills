"use client"

import {
  Tree,
  TreeItem,
  TreeItemIndicator,
  TreeItemLabel,
  visibleTreeRows,
  type TreeItemData,
} from "@ui-sdk/react/tree"
import { ChevronRightIcon } from "lucide-react"
import * as React from "react"

const items: TreeItemData[] = Array.from({ length: 100 }, (_, folder) => ({
  value: `folder-${folder + 1}`,
  label: `Folder ${folder + 1}`,
  children: Array.from({ length: 100 }, (_, file) => ({
    value: `folder-${folder + 1}/file-${file + 1}`,
    label: `File ${file + 1}.txt`,
  })),
}))

const row = 32
const height = 288

function Example() {
  const scroller = React.useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = React.useState(0)
  const [expanded, setExpanded] = React.useState(["folder-1"])
  const rows = React.useMemo(() => visibleTreeRows(items, expanded), [expanded])
  const start = Math.max(0, Math.floor(scrollTop / row) - 4)
  const end = Math.min(rows.length, Math.ceil((scrollTop + height) / row) + 4)
  return (
    <div
      data-slot="scroll"
      ref={scroller}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <Tree
        aria-label="Archive"
        items={items}
        expanded={expanded}
        onExpandedChange={setExpanded}
        onHighlight={(_value, { index }) => {
          const el = scroller.current
          if (!el) {
            return
          }
          const top = index * row
          if (top < el.scrollTop) {
            el.scrollTop = top
          } else if (top + row > el.scrollTop + el.clientHeight - 10) {
            el.scrollTop = top + row - el.clientHeight + 10
          }
          setScrollTop(el.scrollTop)
        }}
        style={{ height: rows.length * row }}
      >
        {rows.slice(start, end).map(({ item, index }) => (
          <TreeItem
            key={item.value}
            value={item.value}
            style={{ top: index * row }}
          >
            <TreeItemLabel>
              {item.children && (
                <TreeItemIndicator>
                  <ChevronRightIcon aria-hidden="true" />
                </TreeItemIndicator>
              )}
              {item.label}
            </TreeItemLabel>
          </TreeItem>
        ))}
      </Tree>
    </div>
  )
}

export { Example }
