import * as React from "react"
import { createTreeCollection } from "@ui-sdk/core"

const titles: Record<string, string> = {
  basics: "Basics",
  setup: "Setup",
  hello: "Hello world",
  layout: "Layout",
  grids: "Grids",
  extras: "Extras",
}

const outline = createTreeCollection([
  { key: "basics", parent: null },
  { key: "setup", parent: "basics" },
  { key: "hello", parent: "basics" },
  { key: "layout", parent: null },
  { key: "grids", parent: "layout" },
  { key: "extras", parent: null, branch: true },
])

function Example() {
  return (
    <div data-slot="tree-behavior-list">
      {outline.keys().map((key) => {
        const { index, size } = outline.position(key)
        const parent = outline.parent(key)
        return (
          <div
            key={key}
            data-section={key}
            data-slot="tree-behavior-row"
            data-branch={outline.isBranch(key) ? "" : undefined}
            style={{
              paddingInlineStart: `${(outline.level(key) - 1) * 16 + 8}px`,
            }}
          >
            <span>
              {outline.isBranch(key) ? "▸ " : ""}
              {titles[key]}
            </span>
            <span data-slot="hint">
              Level {outline.level(key)}, {index} of {size}
              {parent ? ` in ${titles[parent]}` : ""}
            </span>
          </div>
        )
      })}
      <p data-slot="output">
        {outline.size} sections
        {outline.has("appendix") ? ", with an appendix" : ", no appendix yet"}
      </p>
    </div>
  )
}

export { Example }
