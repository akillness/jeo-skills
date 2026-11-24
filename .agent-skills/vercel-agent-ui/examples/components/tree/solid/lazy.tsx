import {
  Tree,
  TreeGroup,
  TreeItem,
  TreeItemIndicator,
  TreeItemLabel,
} from "@ui-sdk/solid/tree"
import type { JSX } from "@solidjs/web"
import { createSignal, For, Match, Show, Switch } from "solid-js"

type Node = { value: string; label: string; branch?: boolean }

const top: Node[] = [
  { value: "users", label: "users", branch: true },
  { value: "orders", label: "orders", branch: true },
  { value: "archive", label: "archive", branch: true },
]

let archiveAsked = false
async function fetchChildren(value: string, signal: AbortSignal) {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, 800)
    signal.addEventListener(
      "abort",
      () => (clearTimeout(timer), reject(signal.reason))
    )
  })
  if (value === "archive" && !archiveAsked) {
    archiveAsked = true
    throw new Error("Network error")
  }
  return Array.from({ length: 3 }, (_, index) => ({
    value: `${value}/${index + 1}`,
    label: `${value.slice(0, -1)}_${index + 1}.json`,
  }))
}

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

const RotateCw = () => (
  <Icon>
    <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
    <path d="M21 3v5h-5" />
  </Icon>
)

function Items(props: { items: Node[]; loaded: Record<string, Node[]> }) {
  return (
    <For each={props.items}>
      {(item) => (
        <TreeItem value={item.value} branch={item.branch}>
          <TreeItemLabel>
            <Show when={item.branch}>
              <TreeItemIndicator>
                {(state) => (
                  <Switch fallback={<ChevronRight />}>
                    <Match when={state.loading}>
                      <LoaderCircle />
                    </Match>
                    <Match when={state.failed}>
                      <RotateCw />
                    </Match>
                  </Switch>
                )}
              </TreeItemIndicator>
            </Show>
            {item.label}
          </TreeItemLabel>
          <Show when={props.loaded[item.value]}>
            {(children) => (
              <TreeGroup>
                <Items items={children()} loaded={props.loaded} />
              </TreeGroup>
            )}
          </Show>
        </TreeItem>
      )}
    </For>
  )
}

function Example() {
  const [loaded, setLoaded] = createSignal<Record<string, Node[]>>({})
  return (
    <Tree
      aria-label="Database"
      loadChildren={async (value, { signal }) => {
        const children = await fetchChildren(value, signal)
        setLoaded((loaded) => ({ ...loaded, [value]: children }))
      }}
      announcement={({ type, label }) =>
        ({
          expanded: "Expanded",
          collapsed: "Collapsed",
          loading: `Loading ${label}`,
          "load-failed": `${label} didn't load. Try again.`,
        })[type]
      }
    >
      <Items items={top} loaded={loaded()} />
    </Tree>
  )
}

export { Example }
