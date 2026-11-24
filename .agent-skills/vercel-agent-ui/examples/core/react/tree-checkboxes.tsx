import * as React from "react"
import {
  createTreeCollection,
  definePrimitive,
  toggleTreeChecked,
  treeCheckedStates,
  treeDataNodes,
  type TreeCheckStrategy,
  type TreeItemData,
} from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"
import { useLog } from "../../shared/react/log"

type CheckTreeOptions = {
  items: TreeItemData[]
  strategy: TreeCheckStrategy
  onCheckedChange?: (checked: string[]) => void
}

type CheckTreeState = { checked: string[]; strategy: TreeCheckStrategy }

type CheckTreeItemState = { checked: boolean | "indeterminate"; level: number }

const checkTree = definePrimitive({
  name: "check-tree",
  options: { items: "value", strategy: "string", onCheckedChange: "callback" },
  state: (options: CheckTreeOptions): CheckTreeState => ({
    checked: [],
    strategy: options.strategy,
  }),
  sync: (options) => ({ strategy: options.strategy }),
  api: (context) => {
    const { store } = context
    let cache:
      | { items: TreeItemData[]; tree: ReturnType<typeof createTreeCollection> }
      | undefined
    const tree = () => {
      const { items } = context.options()
      if (cache?.items !== items) {
        cache = { items, tree: createTreeCollection(treeDataNodes(items)) }
      }
      return cache.tree
    }
    let states: {
      checked: string[]
      strategy: TreeCheckStrategy
      read: (key: string) => boolean | "indeterminate"
    }
    const stateOf = (state: CheckTreeState, key: string) => {
      if (
        states?.checked !== state.checked ||
        states.strategy !== state.strategy
      ) {
        states = {
          ...state,
          read: treeCheckedStates(tree(), state.checked, state.strategy),
        }
      }
      return states.read(key)
    }
    return {
      tree,
      stateOf,
      toggle(key: string) {
        const { checked, strategy } = store.get()
        const next = toggleTreeChecked(tree(), checked, key, { strategy })
        store.set({ checked: next })
        context.options().onCheckedChange?.(next)
      },
    }
  },
  slots: (slot) => ({
    root: slot({ attrs: () => ({ role: "group" }) }),
    item: slot<{ value: string }, CheckTreeItemState>({
      props: { value: "string" },
      state: (state, { api, key }) => ({
        checked: api.stateOf(state, key),
        level: api.tree().level(key),
      }),
      attrs: (state, { api, key }) => {
        const checked = api.stateOf(state, key)
        return {
          type: "button",
          role: "checkbox",
          "aria-checked":
            checked === "indeterminate" ? "mixed" : String(checked),
          "data-checked": checked === true ? "" : undefined,
          "data-indeterminate": checked === "indeterminate" ? "" : undefined,
          style: `padding-inline-start:${(api.tree().level(key) - 1) * 20}px`,
        }
      },
      press: ({ api, key }) => api.toggle(key),
    }),
  }),
})

const parts = createParts(checkTree, { root: "div", item: "button" })

const CheckTree = parts.Root

const CheckTreeItem = parts.Item

const items: TreeItemData[] = [
  {
    value: "src",
    label: "src",
    children: [
      { value: "src/index.ts", label: "index.ts" },
      { value: "src/util.ts", label: "util.ts" },
    ],
  },
  { value: "README.md", label: "README.md" },
]

const flat = (list: TreeItemData[]): TreeItemData[] =>
  list.flatMap((item) => [item, ...flat(item.children ?? [])])

function Example() {
  const log = useLog()
  const [strategy, setStrategy] = React.useState<TreeCheckStrategy>("leaf")
  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <div
          role="radiogroup"
          aria-label="Strategy"
          data-slot="check-tree-strategy"
        >
          {(["leaf", "trunk"] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={strategy === option}
              data-size="sm"
              onClick={() => setStrategy(option)}
            >
              {option[0].toUpperCase() + option.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <CheckTree
        items={items}
        strategy={strategy}
        aria-label="Files"
        onCheckedChange={(checked: string[]) =>
          log(`Value: ${checked.join(", ") || "none"}`)
        }
      >
        {flat(items).map((item) => (
          <CheckTreeItem
            key={item.value}
            value={item.value}
            aria-label={item.label}
          >
            <span data-slot="check-tree-box">
              <span data-show="checked">✓</span>
              <span data-show="indeterminate">–</span>
            </span>
            {item.label}
          </CheckTreeItem>
        ))}
      </CheckTree>
    </div>
  )
}

export {
  checkTree,
  CheckTree,
  CheckTreeItem,
  Example,
  type CheckTreeItemState,
  type CheckTreeOptions,
  type CheckTreeState,
}
