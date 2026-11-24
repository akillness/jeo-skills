import {
  Tree,
  TreeItem,
  TreeItemIndicator,
  TreeItemLabel,
  visibleTreeRows,
  type TreeItemData,
} from "@ui-sdk/solid/tree"
import { createMemo, createSignal, For, Show } from "solid-js"

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
  let scroller: HTMLDivElement | undefined
  const [scrollTop, setScrollTop] = createSignal(0)
  const [expanded, setExpanded] = createSignal(["folder-1"])
  const rows = createMemo(() => visibleTreeRows(items, expanded()))
  const start = () => Math.max(0, Math.floor(scrollTop() / row) - 4)
  const end = () =>
    Math.min(rows().length, Math.ceil((scrollTop() + height) / row) + 4)
  return (
    <div
      data-slot="scroll"
      ref={scroller}
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <Tree
        aria-label="Archive"
        items={items}
        expanded={expanded()}
        onExpandedChange={setExpanded}
        onHighlight={(_value, { index }) => {
          const el = scroller
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
        style={{ height: `${rows().length * row}px` }}
      >
        <For
          each={rows().slice(start(), end())}
          keyed={(visible) => visible.item.value}
        >
          {(visible) => (
            <TreeItem
              value={visible().item.value}
              style={{ top: `${visible().index * row}px` }}
            >
              <TreeItemLabel>
                <Show when={visible().item.children}>
                  <TreeItemIndicator>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="m9 18 6-6-6-6" />
                    </svg>
                  </TreeItemIndicator>
                </Show>
                {visible().item.label}
              </TreeItemLabel>
            </TreeItem>
          )}
        </For>
      </Tree>
    </div>
  )
}

export { Example }
