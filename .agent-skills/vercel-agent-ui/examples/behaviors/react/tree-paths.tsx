import * as React from "react"
import {
  createTreeCollection,
  treeDataNodes,
  treeFromPaths,
} from "@ui-sdk/core"
import { Field, FieldControl, FieldLabel } from "@ui-sdk/react/field"
import { File, Folder } from "lucide-react"

function Example() {
  const [text, setText] = React.useState(
    "src/index.ts\nsrc/lib/util.ts\nREADME.md\nassets/"
  )
  const items = treeFromPaths(text.split("\n").filter(Boolean))
  const nodes = treeDataNodes(items)
  const tree = createTreeCollection(nodes)
  return (
    <div data-slot="stack">
      <Field>
        <FieldLabel>Paths</FieldLabel>
        <FieldControl
          render={
            <textarea
              rows={4}
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          }
        />
      </Field>
      <div data-tree data-slot="tree-behavior-list">
        {nodes.map(({ key, item }) => (
          <span
            key={key}
            data-slot="tree-behavior-row"
            style={{ "--tree-level": tree.level(key) } as React.CSSProperties}
          >
            {item.children ? (
              <Folder aria-hidden="true" />
            ) : (
              <File aria-hidden="true" />
            )}
            <span>{item.label}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

export { Example }
