import * as React from "react"
import { visibleTreeRows, type TreeItemData } from "@ui-sdk/core"

const items: TreeItemData[] = [
  {
    value: "start",
    label: "Getting started",
    children: [
      { value: "install", label: "Install", href: "#install" },
      { value: "old-setup", label: "Old setup", disabled: true },
    ],
  },
  {
    value: "guides",
    label: "Guides",
    children: [{ value: "theming", label: "Theming", href: "#theming" }],
  },
  { value: "faq", label: "FAQ", href: "#faq" },
]

function Example() {
  const [expanded, setExpanded] = React.useState<string[]>(["start"])
  const rows = visibleTreeRows(items, expanded)
  const toggle = (value: string) =>
    setExpanded((current) =>
      current.includes(value)
        ? current.filter((other) => other !== value)
        : [...current, value]
    )
  return (
    <div data-slot="tree-behavior-list">
      {rows.map(({ item, level, index, parent }) => {
        const style = { paddingInlineStart: `${(level - 1) * 16 + 8}px` }
        const note = (
          <span data-slot="hint">
            row {index + 1}
            {parent ? `, in ${parent}` : ""}
          </span>
        )
        return item.children ? (
          <button
            key={item.value}
            type="button"
            aria-expanded={expanded.includes(item.value)}
            onClick={() => toggle(item.value)}
            data-slot="tree-behavior-row"
            style={style}
          >
            {item.label}
            {note}
          </button>
        ) : item.href ? (
          <a
            key={item.value}
            href={item.href}
            data-slot="tree-behavior-row"
            style={style}
          >
            {item.label}
            {note}
          </a>
        ) : (
          <span
            key={item.value}
            aria-disabled={item.disabled}
            data-slot="tree-behavior-row"
            style={style}
          >
            {item.label}
            {note}
          </span>
        )
      })}
    </div>
  )
}

export { Example }
