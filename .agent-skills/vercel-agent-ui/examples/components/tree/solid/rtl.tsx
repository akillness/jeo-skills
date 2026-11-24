import {
  Tree,
  TreeGroup,
  TreeItem,
  TreeItemIndicator,
  TreeItemLabel,
} from "@ui-sdk/solid/tree"
import { For, Show } from "solid-js"

type Node = { value: string; label: string; children?: Node[] }

const folders: Node[] = [
  {
    value: "documents",
    label: "المستندات",
    children: [
      { value: "reports", label: "التقارير" },
      { value: "invoices", label: "الفواتير" },
    ],
  },
  {
    value: "photos",
    label: "الصور",
    children: [
      { value: "trips", label: "الرحلات" },
      { value: "family", label: "العائلة" },
    ],
  },
  { value: "downloads", label: "التنزيلات" },
]

function Items(props: { items: Node[] }) {
  return (
    <For each={props.items}>
      {(item) => (
        <TreeItem value={item.value} branch={item.children !== undefined}>
          <TreeItemLabel>
            <Show when={item.children}>
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
            {item.label}
          </TreeItemLabel>
          <Show when={item.children}>
            {(children) => (
              <TreeGroup>
                <Items items={children()} />
              </TreeGroup>
            )}
          </Show>
        </TreeItem>
      )}
    </For>
  )
}

function Example() {
  return (
    <div dir="rtl">
      <Tree aria-label="الملفات" defaultExpanded={["documents"]}>
        <Items items={folders} />
      </Tree>
    </div>
  )
}

export { Example }
