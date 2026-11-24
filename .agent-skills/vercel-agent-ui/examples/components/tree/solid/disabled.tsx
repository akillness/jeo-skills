import { Switch, SwitchThumb } from "@ui-sdk/solid/switch"
import {
  Tree,
  TreeGroup,
  TreeItem,
  TreeItemIndicator,
  TreeItemLabel,
  type TreeItemData,
} from "@ui-sdk/solid/tree"
import { createSignal, For, Show } from "solid-js"

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

function Items(props: { items: TreeItemData[] }) {
  return (
    <For each={props.items}>
      {(item) => (
        <TreeItem value={item.value} disabled={item.disabled}>
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
  const [focusable, setFocusable] = createSignal(true)
  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <label data-slot="label">
          <Switch checked={focusable()} onCheckedChange={setFocusable}>
            <SwitchThumb />
          </Switch>
          Focusable when disabled
        </label>
      </div>
      <Tree
        aria-label="Plans"
        items={items}
        defaultExpanded={["plans"]}
        focusableWhenDisabled={focusable()}
      >
        <Items items={items} />
      </Tree>
    </div>
  )
}

export { Example }
