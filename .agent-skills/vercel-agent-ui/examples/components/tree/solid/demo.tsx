import {
  Tree,
  TreeGroup,
  TreeItem,
  TreeItemIndicator,
  TreeItemLabel,
} from "@ui-sdk/solid/tree"
import type { JSX } from "@solidjs/web"
import { For, Show } from "solid-js"

type Node = { value: string; label: string; children?: Node[] }

const files: Node[] = [
  {
    value: "app",
    label: "app",
    children: [
      { value: "app/layout.tsx", label: "layout.tsx" },
      { value: "app/page.tsx", label: "page.tsx" },
      {
        value: "app/settings",
        label: "settings",
        children: [{ value: "app/settings/page.tsx", label: "page.tsx" }],
      },
    ],
  },
  {
    value: "components",
    label: "components",
    children: [
      { value: "components/button.tsx", label: "button.tsx" },
      { value: "components/card.tsx", label: "card.tsx" },
    ],
  },
  { value: "components.json", label: "components.json" },
  { value: "package.json", label: "package.json" },
  { value: "README.md", label: "README.md" },
]

function Icon(props: { children: JSX.Element }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {props.children}
    </svg>
  )
}

const ChevronRight = () => (
  <Icon>
    <path d="m9 18 6-6-6-6" />
  </Icon>
)

const Folder = () => (
  <Icon>
    <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
  </Icon>
)

const FolderOpen = () => (
  <Icon>
    <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" />
  </Icon>
)

const File = () => (
  <Icon>
    <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" />
    <path d="M14 2v5a1 1 0 0 0 1 1h5" />
  </Icon>
)

function Items(props: { items: Node[] }) {
  return (
    <For each={props.items}>
      {(item) => (
        <TreeItem value={item.value} branch={item.children !== undefined}>
          <TreeItemLabel>
            <Show when={item.children} fallback={<File />}>
              <TreeItemIndicator>
                <ChevronRight />
              </TreeItemIndicator>
              <Folder />
              <FolderOpen />
            </Show>
            <span>{item.label}</span>
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
    <Tree
      aria-label="Files"
      defaultExpanded={["app"]}
      defaultValue="app/page.tsx"
    >
      <Items items={files} />
    </Tree>
  )
}

export { Example }
