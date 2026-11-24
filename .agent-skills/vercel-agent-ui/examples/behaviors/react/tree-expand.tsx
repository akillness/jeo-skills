import * as React from "react"
import { createTreeCollection, definePrimitive } from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"
import { ChevronRight, File, Folder } from "lucide-react"
import { useLog } from "../../shared/react/log"

const files = createTreeCollection([
  { key: "src", parent: null },
  { key: "src/lib", parent: "src" },
  { key: "src/lib/date.ts", parent: "src/lib" },
  { key: "src/lib/math.ts", parent: "src/lib" },
  { key: "src/index.ts", parent: "src" },
  { key: "docs", parent: null },
  { key: "docs/intro.md", parent: "docs" },
  { key: "README.md", parent: null },
])

type FilesOptions = { onPick?: (key: string) => void }

type FilesState = { expanded: string[]; picked: string | null }

const fileList = definePrimitive({
  name: "file-list",
  options: { onPick: "callback" },
  state: (_options: FilesOptions): FilesState => ({
    expanded: ["src"],
    picked: null,
  }),
  api: (context) => {
    const { store } = context
    return {
      toggle(key: string) {
        const { expanded } = store.get()
        if (!files.isBranch(key)) {
          store.set({ picked: key })
          context.options().onPick?.(key)
          return
        }
        store.set({
          expanded: expanded.includes(key)
            ? expanded.filter((other) => other !== key)
            : [...expanded, key],
        })
      },
      expandAll: () =>
        store.set({
          expanded: files.keys().filter((key) => files.isBranch(key)),
        }),
    }
  },
  slots: (slot) => ({
    root: slot<{}, { shown: readonly string[] }>({
      state: (state) => ({ shown: files.visible(state.expanded) }),
    }),
    row: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, { key }) => ({
        type: "button",
        "aria-expanded": files.isBranch(key)
          ? String(state.expanded.includes(key))
          : undefined,
        "aria-current": state.picked === key ? "true" : undefined,
        style: `--tree-level:${files.level(key)}`,
      }),
      press: ({ api, key }) => api.toggle(key),
    }),
    expand: slot({
      attrs: () => ({ type: "button" }),
      press: ({ api }) => api.expandAll(),
    }),
  }),
})

const parts = createParts(fileList, {
  root: "div",
  row: "button",
  expand: "button",
})

const FileList = parts.Root

const FileRow = parts.Row

const FileExpandAll = parts.Expand

const name = (key: string) => key.split("/").at(-1)

const fileCount = (key: string) => {
  const count = files
    .descendants(key)
    .filter((below) => !files.isBranch(below)).length
  return `${count} ${count === 1 ? "file" : "files"}`
}

function Example() {
  const log = useLog()
  return (
    <FileList
      onPick={(key: string) =>
        log([...files.ancestors(key), key].map(name).join(" / "))
      }
    >
      {({ shown }) => (
        <div data-slot="stack">
          <div data-slot="controls">
            <FileExpandAll data-size="sm">Expand All</FileExpandAll>
          </div>
          <div data-slot="tree-behavior-list">
            {shown.map((key) => (
              <FileRow key={key} value={key}>
                {files.isBranch(key) ? (
                  <>
                    <ChevronRight aria-hidden="true" />
                    <Folder aria-hidden="true" />
                  </>
                ) : (
                  <File aria-hidden="true" />
                )}
                <span>{name(key)}</span>
                {files.isBranch(key) && (
                  <span data-slot="hint">{fileCount(key)}</span>
                )}
              </FileRow>
            ))}
          </div>
        </div>
      )}
    </FileList>
  )
}

export {
  Example,
  fileList,
  FileExpandAll,
  FileList,
  FileRow,
  type FilesOptions,
  type FilesState,
}
