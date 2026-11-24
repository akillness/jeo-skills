import {
  createTreeController,
  Tree,
  TreeGroup,
  TreeItem,
  TreeItemIndicator,
  TreeItemLabel,
  type TreeItemData,
} from "@ui-sdk/solid/tree"
import { For, Show } from "solid-js"

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

function Items(props: { items: TreeItemData[] }) {
  return (
    <For each={props.items}>
      {(item) => (
        <TreeItem value={item.value}>
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
  const settings = createTreeController()
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
