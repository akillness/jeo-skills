import {
  Tree,
  TreeGroup,
  TreeItem,
  TreeItemIndicator,
  TreeItemLabel,
  treeFromPaths,
  type TreeItemData,
} from "@ui-sdk/solid/tree"
import type { JSX } from "@solidjs/web"
import { For, Show } from "solid-js"
import { useLog } from "../../../shared/solid/log"

const paths = [
  "src/index.ts",
  "src/lib/format.ts",
  "src/lib/parse.ts",
  "src/routes/home.tsx",
  "src/routes/about.tsx",
  "tests/",
  "package.json",
  "tsconfig.json",
]

const items = treeFromPaths(paths)
const files = new Set(paths.filter((path) => !path.endsWith("/")))

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

const LoaderCircle = () => (
  <Icon>
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </Icon>
)

function Items(props: { items: TreeItemData[] }) {
  return (
    <For each={props.items}>
      {(item) => (
        <TreeItem value={item.value}>
          <TreeItemLabel>
            {(state) => (
              <>
                <Show when={item.children}>
                  <TreeItemIndicator>
                    <ChevronRight />
                  </TreeItemIndicator>
                </Show>
                <span>{item.label}</span>
                <Show when={state.pending}>
                  <LoaderCircle />
                </Show>
              </>
            )}
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
  const log = useLog()
  return (
    <Tree
      aria-label="Project"
      paths={paths}
      defaultExpanded={["src"]}
      defaultValue="src/index.ts"
      activation="automatic"
      onAction={async (value) => {
        if (!files.has(value)) {
          return
        }
        await new Promise((resolve) => setTimeout(resolve, 600))
        log(`Opened ${value}`)
      }}
    >
      <Items items={items} />
    </Tree>
  )
}

export { Example }
